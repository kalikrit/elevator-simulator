// src/composables/useElevatorSystem.ts

import { reactive, onMounted, onUnmounted } from 'vue';
import type { Elevator, Trip, Direction } from '../types/elevator';

const FLOORS = 25;
const ELEVATOR_COUNT = 4;
const SPEED = 1;
const WAIT_TIME = 5000;

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

  // === Оценка времени до этажа вызова с учётом попутного подбора ===
  const estimatePickupTime = (elevator: Elevator, from: number): { time: number; canPickup: boolean } => {
    if (!elevator.isMoving && elevator.queue.length === 0 && !elevator.isWaiting) {
      return { time: Math.abs(elevator.currentFloor - from), canPickup: false };
    }

    // Разрешаем попутный подбор ТОЛЬКО для спускающихся лифтов
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

  // === Оценка времени всей поездки (from → to) ===
  const estimateTotalTime = (elevator: Elevator, from: number, to: number): number => {
    const pickup = estimatePickupTime(elevator, from);
    const travelFromTo = Math.abs(from - to);
    if (pickup.canPickup) {
      return pickup.time + travelFromTo + (WAIT_TIME / 1000);
    }
    return pickup.time + travelFromTo;
  };

  // === Вспомогательная функция для вставки в отсортированную очередь ===
  const addToQueueSorted = (elevator: Elevator, floor: number) => {
    if (elevator.queue.includes(floor)) return;

    const direction = elevator.direction;
    if (direction === 'idle' || elevator.queue.length === 0) {
      elevator.queue.push(floor);
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
    } else {
      elevator.queue.push(floor);
    }
  };

  // === Запрос поездки ===
  const requestTrip = (fromFloor: number, toFloor: number) => {
    if (fromFloor === toFloor) {
      console.warn('Начальный и конечный этажи совпадают');
      return;
    }

    console.log(`[REQUEST] Вызов с ${fromFloor+1} на ${toFloor+1}`);

    let bestElevator: Elevator | null = null;
    let bestTime = Infinity;
    let bestIsPickup = false;

    // 1️⃣ Сначала ищем лифт, который может подобрать попутно (только спускающиеся)
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

    // 2️⃣ Если попутных нет — выбираем любой лифт
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

    if (!bestElevator) {
      console.warn('[REQUEST] Не найден лифт');
      return;
    }

    console.log(`[REQUEST] Выбран лифт #${bestElevator.id+1}, попутный: ${bestIsPickup}`);

    // 3️⃣ Добавляем этажи в очередь с сортировкой
    addToQueueSorted(bestElevator, fromFloor);
    addToQueueSorted(bestElevator, toFloor);

    // Если лифт стоит, запускаем его с первой цели
    if (!bestElevator.isMoving && !bestElevator.isWaiting && bestElevator.queue.length > 0) {
      bestElevator.targetFloor = bestElevator.queue[0];
      bestElevator.isMoving = true;
      bestElevator.direction = bestElevator.targetFloor > bestElevator.currentFloor ? 'up' : 'down';
      console.log(`[REQUEST] Запущен лифт #${bestElevator.id+1} к ${bestElevator.targetFloor+1}`);
    } else if (bestElevator.isMoving && bestElevator.queue.length > 0) {
      const firstTarget = bestElevator.queue[0];
      if (bestElevator.targetFloor !== firstTarget) {
        bestElevator.targetFloor = firstTarget;
        bestElevator.direction = bestElevator.targetFloor > bestElevator.currentFloor ? 'up' : 'down';
        console.log(`[REQUEST] Лифт #${bestElevator.id+1} переключён на ${bestElevator.targetFloor+1}`);
      }
    }

    trips.push({ from: fromFloor, to: toFloor, timestamp: Date.now() });
  };

  // === Обновление состояния лифтов (тик) ===
  const updateElevators = (deltaMs: number) => {
    const deltaSeconds = deltaMs / 1000;

    for (const elevator of elevators) {
      // Обработка ожидания
      if (elevator.isWaiting) {
        elevator.waitTimeRemaining -= deltaMs;
        if (elevator.waitTimeRemaining <= 0) {
          elevator.isWaiting = false;
          elevator.isMoving = true;
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

      // Если очередь пуста
      if (elevator.queue.length === 0) {
        // Если лифт не на первом этаже, отправляем его туда
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
      }

      // Движение к цели
      if (elevator.currentFloor < elevator.targetFloor) {
        elevator.currentFloor += SPEED * deltaSeconds;
        if (elevator.currentFloor >= elevator.targetFloor) {
          elevator.currentFloor = elevator.targetFloor;
          elevator.queue.shift();
          const reachedFloor = elevator.currentFloor;
          console.log(`[UPDATE] Лифт #${elevator.id+1} достиг ${reachedFloor+1}`);
          floorReachedCallbacks.forEach(cb => cb(reachedFloor));

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
          }
        }
      } else if (elevator.currentFloor > elevator.targetFloor) {
        elevator.currentFloor -= SPEED * deltaSeconds;
        if (elevator.currentFloor <= elevator.targetFloor) {
          elevator.currentFloor = elevator.targetFloor;
          elevator.queue.shift();
          const reachedFloor = elevator.currentFloor;
          console.log(`[UPDATE] Лифт #${elevator.id+1} достиг ${reachedFloor+1}`);
          floorReachedCallbacks.forEach(cb => cb(reachedFloor));

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

  onMounted(startSimulation);
  onUnmounted(stopSimulation);

  return { elevators, trips, requestTrip, onFloorReached };
}