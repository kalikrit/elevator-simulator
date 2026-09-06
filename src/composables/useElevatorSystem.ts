// src/composables/useElevatorSystem.ts

import { reactive, onMounted, onUnmounted } from 'vue';
import type { Elevator, Trip, Direction, Scenario, ScenarioStep, Metrics } from '../types/elevator';

const FLOORS = 25;
const ELEVATOR_COUNT = 4;
const SPEED = 1;
const WAIT_TIME = 5000;

export const SCENARIOS: Record<string, Scenario> = {
  scenarioB: {
    id: 'scenarioB',
    name: 'Конфликт направлений',
    steps: [
      { floor: 5, time: 0 },
      { floor: 20, time: 1 },
      { floor: 10, time: 2 },
      { floor: 24, time: 3 },
      { floor: 8, time: 4 },
      { floor: 18, time: 5 },
    ],
  },
};

const floorReachedCallbacks: ((floor: number) => void)[] = [];

export function useElevatorSystem() {
  const elevators = reactive<Elevator[]>(
    Array.from({ length: ELEVATOR_COUNT }, (_, i) => ({
      id: i,
      currentFloor: 0,
      targetFloor: null,
      direction: 'idle' as Direction,
      isMoving: false,
      passengers: 0,
      queue: [],
      isWaiting: false,
      waitTimeRemaining: 0,
    }))
  );

  const trips = reactive<Trip[]>([]);
  let intervalId: number | null = null;
  let lastTimestamp = performance.now();

  let currentAlgorithm: 'nearest' | 'totalTime' = 'nearest';
  let activeScenario: Scenario | null = null;
  let scenarioStartTime: number = 0;
  let scenarioTimeouts: number[] = [];
  let isScenarioRunning = false;
  let callTimes = new Map<number, number>();
  let waitTimes: number[] = [];
  let totalDistance = 0;
  let totalStops = 0;
  let lastPositions: number[] = [0, 0, 0, 0];
  let currentAlgorithmName = 'Ближайший доступный';

  const callMadeCallbacks: ((step: ScenarioStep) => void)[] = [];
  const elevatorArrivedCallbacks: ((floor: number, elevatorId: number) => void)[] = [];
  const scenarioCompletedCallbacks: ((metrics: Metrics) => void)[] = [];

  const estimateTotalCompletionTime = (elevator: Elevator, from: number, to: number): number => {
    let current = elevator.currentFloor;
    let totalTime = 0;
    for (const target of elevator.queue) {
      totalTime += Math.abs(current - target);
      current = target;
      totalTime += WAIT_TIME / 1000;
    }
    totalTime += Math.abs(current - from);
    current = from;
    totalTime += WAIT_TIME / 1000;
    totalTime += Math.abs(current - to);
    return totalTime;
  };

  const estimatePickupTime = (elevator: Elevator, from: number): { time: number; canPickup: boolean } => {
    if (!elevator.isMoving && elevator.queue.length === 0 && !elevator.isWaiting) {
      return { time: Math.abs(elevator.currentFloor - from), canPickup: false };
    }

    if (elevator.direction === 'down' && from < elevator.currentFloor) {
      const hasLowerTarget = elevator.queue.some(target => target < from);
      if (hasLowerTarget) {
        return { time: Math.abs(elevator.currentFloor - from), canPickup: true };
      }
    }

    let current = elevator.currentFloor;
    let total = 0;
    for (const target of elevator.queue) {
      total += Math.abs(current - target);
      current = target;
    }
    total += Math.abs(current - from);
    total += elevator.queue.length * (WAIT_TIME / 1000);
    return { time: total, canPickup: false };
  };

  const estimateTotalTime = (elevator: Elevator, from: number, to: number): number => {
    const pickup = estimatePickupTime(elevator, from);
    const travelFromTo = Math.abs(from - to);
    if (pickup.canPickup) {
      return pickup.time + travelFromTo + (WAIT_TIME / 1000);
    }
    return pickup.time + travelFromTo;
  };

  const addToQueueSorted = (elevator: Elevator, floor: number) => {
    if (elevator.queue.includes(floor)) {
      console.log(`[QUEUE] Лифт #${elevator.id+1}: этаж ${floor+1} уже есть в очереди`);
      return;
    }

    const direction = elevator.direction;
    if (direction === 'idle' || elevator.queue.length === 0) {
      elevator.queue.push(floor);
      console.log(`[QUEUE] Лифт #${elevator.id+1}: добавлен ${floor+1} в конец (стоял или очередь пуста)`);
      return;
    }

    let insertIndex = -1;
    if (direction === 'up') {
      for (let i = 0; i < elevator.queue.length; i++) {
        if (elevator.queue[i] > floor) {
          insertIndex = i;
          break;
        }
      }
    } else if (direction === 'down') {
      for (let i = 0; i < elevator.queue.length; i++) {
        if (elevator.queue[i] < floor) {
          insertIndex = i;
          break;
        }
      }
    }

    if (insertIndex !== -1) {
      elevator.queue.splice(insertIndex, 0, floor);
      console.log(`[QUEUE] Лифт #${elevator.id+1}: вставлен ${floor+1} на позицию ${insertIndex} (направление ${direction})`);
    } else {
      elevator.queue.push(floor);
      console.log(`[QUEUE] Лифт #${elevator.id+1}: добавлен ${floor+1} в конец (не найдена позиция)`);
    }
  };

  const requestTrip = (fromFloor: number, toFloor: number) => {
    if (fromFloor >= FLOORS || toFloor >= FLOORS) {
      console.warn(`[REQUEST] Неверный этаж: from=${fromFloor}, to=${toFloor}, максимальный индекс ${FLOORS-1}`);
      return;
    }
    
    if (fromFloor === toFloor) {
      console.warn('Начальный и конечный этажи совпадают');
      return;
    }

    console.log(`[REQUEST] Вызов с ${fromFloor+1} на ${toFloor+1}, алгоритм: ${currentAlgorithm}`);

    let bestElevator: Elevator | null = null;
    let bestTime = Infinity;
    let bestIsPickup = false;

    if (currentAlgorithm === 'nearest') {
      for (const elevator of elevators) {
        const pickup = estimatePickupTime(elevator, fromFloor);
        if (pickup.canPickup) {
          const totalTime = pickup.time + Math.abs(fromFloor - toFloor) + WAIT_TIME / 1000;
          if (totalTime < bestTime) {
            bestTime = totalTime;
            bestElevator = elevator;
            bestIsPickup = true;
          }
        }
      }
      if (!bestElevator) {
        for (const elevator of elevators) {
          const totalTime = estimateTotalTime(elevator, fromFloor, toFloor);
          if (totalTime < bestTime) {
            bestTime = totalTime;
            bestElevator = elevator;
            bestIsPickup = false;
          }
        }
      }
    } else {
      for (const elevator of elevators) {
        const totalTime = estimateTotalCompletionTime(elevator, fromFloor, toFloor);
        if (totalTime < bestTime) {
          bestTime = totalTime;
          bestElevator = elevator;
        }
      }
      bestIsPickup = false;
    }

    if (!bestElevator) {
      console.warn('[REQUEST] Не найден лифт');
      return;
    }

    console.log(`[REQUEST] Выбран лифт #${bestElevator.id+1}`);

    addToQueueSorted(bestElevator, fromFloor);
    addToQueueSorted(bestElevator, toFloor);

    console.log(`[QUEUE] Лифт #${bestElevator.id+1} очередь после добавления: ${bestElevator.queue.map(f => f+1).join(' → ')}`);

    const firstTarget = bestElevator.queue[0];
    if (bestElevator.targetFloor !== firstTarget) {
      bestElevator.targetFloor = firstTarget;
      bestElevator.direction = bestElevator.targetFloor > bestElevator.currentFloor ? 'up' : 'down';

      if (bestElevator.isWaiting) {
        bestElevator.isWaiting = false;
        bestElevator.isMoving = true;
        bestElevator.waitTimeRemaining = 0;
        console.log(`[REQUEST] Лифт #${bestElevator.id+1} прервал ожидание, едет к ${bestElevator.targetFloor+1}`);
      } else if (!bestElevator.isMoving) {
        bestElevator.isMoving = true;
        console.log(`[REQUEST] Запущен лифт #${bestElevator.id+1} к ${bestElevator.targetFloor+1}`);
      } else {
        console.log(`[REQUEST] Лифт #${bestElevator.id+1} переключён на ${bestElevator.targetFloor+1}`);
      }
    } else {
      if (!bestElevator.isMoving && !bestElevator.isWaiting) {
        bestElevator.isMoving = true;
        bestElevator.direction = bestElevator.targetFloor > bestElevator.currentFloor ? 'up' : 'down';
        console.log(`[REQUEST] Запущен лифт #${bestElevator.id+1} к ${bestElevator.targetFloor+1}`);
      }
    }

    trips.push({ from: fromFloor, to: toFloor, timestamp: Date.now() });
  };

  const updateElevators = (deltaMs: number) => {
    const deltaSeconds = deltaMs / 1000;

    for (const elevator of elevators) {
      // === ОБРАБОТКА ОЖИДАНИЯ ===
      if (elevator.isWaiting) {
        elevator.waitTimeRemaining -= deltaMs;
        console.log(`[WAIT] Лифт #${elevator.id+1} осталось ждать: ${elevator.waitTimeRemaining}ms`);

        // Принудительный выход, если ждёт слишком долго (защита от зависания)
        if (elevator.waitTimeRemaining <= 0 || elevator.waitTimeRemaining < -5000) {
          elevator.isWaiting = false;
          elevator.isMoving = true;
          // Обновляем направление на основе текущей цели
          if (elevator.targetFloor !== null) {
            elevator.direction = elevator.targetFloor > elevator.currentFloor ? 'up' : 'down';
          } else {
            elevator.isMoving = false;
            elevator.direction = 'idle';
          }
          console.log(`[UPDATE] Лифт #${elevator.id+1} закончил ожидание, движется к ${elevator.targetFloor !== null ? elevator.targetFloor+1 : 'никуда'}`);
        }
        continue;
      }

      // === ОСТАЛЬНАЯ ЛОГИКА ДВИЖЕНИЯ ===
      if (elevator.queue.length === 0) {
        if (elevator.currentFloor !== 0) {
          elevator.queue.push(0);
          elevator.targetFloor = 0;
          elevator.direction = 'down';
          elevator.isMoving = true;
          console.log(`[UPDATE] Лифт #${elevator.id+1} возвращается на первый этаж`);
        } else {
          elevator.isMoving = false;
          elevator.direction = 'idle';
          elevator.targetFloor = null;
        }
        continue;
      }

      if (elevator.targetFloor === null) {
        elevator.targetFloor = elevator.queue[0];
        elevator.direction = elevator.targetFloor > elevator.currentFloor ? 'up' : 'down';
        elevator.isMoving = true;
        console.log(`[UPDATE] Лифт #${elevator.id+1} новая цель ${elevator.targetFloor+1}`);
      }

      // Движение вверх
      if (elevator.currentFloor < elevator.targetFloor) {
        elevator.currentFloor += SPEED * deltaSeconds;
        if (elevator.currentFloor > FLOORS - 1) elevator.currentFloor = FLOORS - 1;
        if (elevator.currentFloor >= elevator.targetFloor) {
          elevator.currentFloor = elevator.targetFloor;
          const removed = elevator.queue.shift();
          while (elevator.queue.includes(removed)) {
            const index = elevator.queue.indexOf(removed);
            elevator.queue.splice(index, 1);
            console.log(`[QUEUE] Лифт #${elevator.id+1}: удалён дубликат ${removed+1} из очереди`);
          }
          console.log(`[QUEUE] Лифт #${elevator.id+1}: удалён ${removed+1} из очереди, осталось: ${elevator.queue.map(f => f+1).join(' → ') || 'пусто'}`);

          const reachedFloor = elevator.currentFloor;
          console.log(`[UPDATE] Лифт #${elevator.id+1} достиг ${reachedFloor+1}`);
          floorReachedCallbacks.forEach(cb => cb(reachedFloor));

          if (callTimes.has(reachedFloor)) {
            const waitTime = performance.now() - callTimes.get(reachedFloor)!;
            waitTimes.push(waitTime);
            callTimes.delete(reachedFloor);
            console.log(`[WAIT] Время ожидания для этажа ${reachedFloor+1}: ${waitTime/1000}с`);
          }

          const deltaDist = Math.abs(elevator.currentFloor - lastPositions[elevator.id]);
          totalDistance += deltaDist;
          lastPositions[elevator.id] = elevator.currentFloor;
          if (elevator.queue.length > 0) {
            totalStops++;
            elevatorArrivedCallbacks.forEach(cb => cb(reachedFloor, elevator.id));
          }

          if (elevator.queue.length > 0) {
            elevator.targetFloor = elevator.queue[0];
            elevator.isWaiting = true;
            elevator.waitTimeRemaining = WAIT_TIME;
            elevator.isMoving = false;
            console.log(`[UPDATE] Лифт #${elevator.id+1} ожидает 5с, следующая цель ${elevator.targetFloor+1}`);
          } else {
            elevator.targetFloor = null;
            elevator.isMoving = false;
            elevator.direction = 'idle';
            console.log(`[UPDATE] Лифт #${elevator.id+1} завершил все поездки`);
            elevatorArrivedCallbacks.forEach(cb => cb(reachedFloor, elevator.id));
          }
        }
      }
      // Движение вниз
      else if (elevator.currentFloor > elevator.targetFloor) {
        elevator.currentFloor -= SPEED * deltaSeconds;
        if (elevator.currentFloor < 0) elevator.currentFloor = 0;
        if (elevator.currentFloor <= elevator.targetFloor) {
          elevator.currentFloor = elevator.targetFloor;
          const removed = elevator.queue.shift();
          while (elevator.queue.includes(removed)) {
            const index = elevator.queue.indexOf(removed);
            elevator.queue.splice(index, 1);
            console.log(`[QUEUE] Лифт #${elevator.id+1}: удалён дубликат ${removed+1} из очереди`);
          }
          console.log(`[QUEUE] Лифт #${elevator.id+1}: удалён ${removed+1} из очереди, осталось: ${elevator.queue.map(f => f+1).join(' → ') || 'пусто'}`);

          const reachedFloor = elevator.currentFloor;
          console.log(`[UPDATE] Лифт #${elevator.id+1} достиг ${reachedFloor+1}`);
          floorReachedCallbacks.forEach(cb => cb(reachedFloor));

          if (callTimes.has(reachedFloor)) {
            const waitTime = performance.now() - callTimes.get(reachedFloor)!;
            waitTimes.push(waitTime);
            callTimes.delete(reachedFloor);
            console.log(`[WAIT] Время ожидания для этажа ${reachedFloor+1}: ${waitTime/1000}с`);
          }

          const deltaDist = Math.abs(elevator.currentFloor - lastPositions[elevator.id]);
          totalDistance += deltaDist;
          lastPositions[elevator.id] = elevator.currentFloor;
          if (elevator.queue.length > 0) {
            totalStops++;
            elevatorArrivedCallbacks.forEach(cb => cb(reachedFloor, elevator.id));
          }

          if (elevator.queue.length > 0) {
            elevator.targetFloor = elevator.queue[0];
            elevator.isWaiting = true;
            elevator.waitTimeRemaining = WAIT_TIME;
            elevator.isMoving = false;
            console.log(`[UPDATE] Лифт #${elevator.id+1} ожидает 5с, следующая цель ${elevator.targetFloor+1}`);
          } else {
            elevator.targetFloor = null;
            elevator.isMoving = false;
            elevator.direction = 'idle';
            console.log(`[UPDATE] Лифт #${elevator.id+1} завершил все поездки`);
            elevatorArrivedCallbacks.forEach(cb => cb(reachedFloor, elevator.id));
          }
        }
      }
    }
  };

  const onFloorReached = (callback: (floor: number) => void) => {
    floorReachedCallbacks.push(callback);
  };

  const startSimulation = () => {
    if (intervalId) return;
    lastTimestamp = performance.now();
    intervalId = setInterval(() => {
      const now = performance.now();
      const deltaMs = now - lastTimestamp;
      lastTimestamp = now;
      updateElevators(deltaMs);
    }, 1000 / 60);
  };

  const stopSimulation = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const setAlgorithm = (algo: 'nearest' | 'totalTime') => {
    currentAlgorithm = algo;
    currentAlgorithmName = algo === 'nearest' ? 'Ближайший доступный' : 'Прогнозирующий по полному времени';
    console.log(`[Алгоритм] Установлен: ${currentAlgorithmName}`);
  };

  const runScenario = (scenarioId: string, algorithmName?: string) => {
    if (isScenarioRunning) {
      console.warn('[Сценарий] Уже запущен');
      return;
    }
    const scenario = SCENARIOS[scenarioId];
    if (!scenario) {
      console.error('[Сценарий] Не найден:', scenarioId);
      return;
    }

    if (algorithmName) {
      if (algorithmName === 'Ближайший доступный') setAlgorithm('nearest');
      else if (algorithmName === 'Прогнозирующий по полному времени') setAlgorithm('totalTime');
    }

    resetElevators();
    callTimes.clear();
    waitTimes = [];
    totalDistance = 0;
    totalStops = 0;
    lastPositions = elevators.map(e => e.currentFloor);

    activeScenario = scenario;
    isScenarioRunning = true;
    scenarioStartTime = performance.now();

    console.log(`[Сценарий] Запуск "${scenario.name}" (${scenario.steps.length} вызовов), алгоритм: ${currentAlgorithmName}`);

    scenario.steps.forEach((step) => {
      const delay = step.time * 1000;
      const timeout = setTimeout(() => {
        const now = performance.now();
        callTimes.set(step.floor, now);
        requestTrip(step.floor, 0);
        callMadeCallbacks.forEach(cb => cb(step));
        console.log(`[Сценарий] Вызов на ${step.floor+1} в ${((now - scenarioStartTime)/1000).toFixed(2)}с`);
      }, delay);
      scenarioTimeouts.push(timeout);
    });

    const lastStepTime = scenario.steps[scenario.steps.length - 1].time * 1000 + 15000;
    const timeout = setTimeout(() => {
      checkScenarioCompletion();
    }, lastStepTime);
    scenarioTimeouts.push(timeout);
  };

  const resetElevators = () => {
    scenarioTimeouts.forEach(t => clearTimeout(t));
    scenarioTimeouts = [];
    isScenarioRunning = false;
    activeScenario = null;

    for (const elevator of elevators) {
      elevator.queue = [];
      elevator.targetFloor = null;
      elevator.isMoving = false;
      elevator.isWaiting = false;
      elevator.waitTimeRemaining = 0;
      elevator.currentFloor = 0;
      elevator.direction = 'idle';
    }
    callTimes.clear();
    waitTimes = [];
    totalDistance = 0;
    totalStops = 0;
    lastPositions = elevators.map(e => e.currentFloor);
  };

  const checkScenarioCompletion = () => {
    const allIdle = elevators.every(e => !e.isMoving && e.queue.length === 0 && e.currentFloor === 0);
    if (allIdle) {
      finishScenario();
    } else {
      setTimeout(checkScenarioCompletion, 1000);
    }
  };

  const finishScenario = () => {
    isScenarioRunning = false;
    const totalTime = (performance.now() - scenarioStartTime) / 1000;
    const avgWait = waitTimes.length ? waitTimes.reduce((a,b) => a+b, 0) / waitTimes.length / 1000 : 0;
    const maxWait = waitTimes.length ? Math.max(...waitTimes) / 1000 : 0;

    const metrics: Metrics = {
      algorithmName: currentAlgorithmName,
      totalTime: totalTime,
      averageWaitTime: avgWait,
      maxWaitTime: maxWait,
      totalDistance: totalDistance,
      totalStops: totalStops,
      callsCount: waitTimes.length,
      waitTimes: waitTimes.map(t => t / 1000),
    };

    console.log('[Сценарий] Завершён! Метрики:', metrics);
    scenarioCompletedCallbacks.forEach(cb => cb(metrics));
  };

  const onCallMade = (callback: (step: ScenarioStep) => void) => {
    callMadeCallbacks.push(callback);
  };

  const onElevatorArrived = (callback: (floor: number, elevatorId: number) => void) => {
    elevatorArrivedCallbacks.push(callback);
  };

  const onScenarioCompleted = (callback: (metrics: Metrics) => void) => {
    scenarioCompletedCallbacks.push(callback);
  };

  onMounted(startSimulation);
  onUnmounted(stopSimulation);

  return {
    elevators,
    trips,
    requestTrip,
    onFloorReached,
    runScenario,
    resetElevators,
    onCallMade,
    onElevatorArrived,
    onScenarioCompleted,
    isScenarioRunning,
    setAlgorithm,
    currentAlgorithm,
  };
}