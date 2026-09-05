// src/composables/useElevatorSystem.ts

import { reactive, onMounted, onUnmounted } from 'vue';
import type { Elevator, Trip, Direction } from '../types/elevator';

const FLOORS = 25;
const ELEVATOR_COUNT = 4;
const SPEED = 1;
const WAIT_TIME = 5000;

// Массив колбэков для событий достижения этажа
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

  // === Запрос поездки с приоритетом попутного подбора ===
  const requestTrip = (fromFloor: number, toFloor: number) => {
    if (fromFloor === toFloor) {
      console.warn('Начальный и конечный этажи совпадают');
      return;
    }

    let bestElevator: Elevator | null = null;
    let bestTime = Infinity;
    let bestIsPickup = false;

    // 1️⃣ Сначала ищем лифт, который может подобрать попутно
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

    if (!bestElevator) return;

    // 3️⃣ Добавляем этажи в очередь и корректируем текущую цель при необходимости
    if (bestIsPickup) {
      const direction = bestElevator.direction;
      let insertIndex = -1;
      for (let i = 0; i < bestElevator.queue.length; i++) {
        const target = bestElevator.queue[i];
        if ((direction === 'up' && target > fromFloor) || (direction === 'down' && target < fromFloor)) {
          insertIndex = i;
          break;
        }
      }
      if (insertIndex !== -1 && !bestElevator.queue.includes(fromFloor)) {
        bestElevator.queue.splice(insertIndex, 0, fromFloor);
      } else if (!bestElevator.queue.includes(fromFloor)) {
        bestElevator.queue.push(fromFloor);
      }

      // Если лифт уже движется, проверим, можно ли обновить текущую цель
      if (bestElevator.isMoving && bestElevator.targetFloor !== null) {
        const currentPos = bestElevator.currentFloor;
        const currentTarget = bestElevator.targetFloor;
        // Проверяем, находится ли новая цель between currentPos и currentTarget (по направлению)
        if (direction === 'down' && fromFloor < currentPos && fromFloor > currentTarget) {
          // Новая цель ближе к currentPos, чем currentTarget
          bestElevator.targetFloor = fromFloor;
          bestElevator.direction = 'down';
        } else if (direction === 'up' && fromFloor > currentPos && fromFloor < currentTarget) {
          bestElevator.targetFloor = fromFloor;
          bestElevator.direction = 'up';
        }
      }
    } else {
      if (!bestElevator.queue.includes(fromFloor)) {
        bestElevator.queue.push(fromFloor);
      }
    }

    if (!bestElevator.queue.includes(toFloor)) {
      bestElevator.queue.push(toFloor);
    }

    // Если лифт стоял, запускаем
    if (!bestElevator.isMoving && !bestElevator.isWaiting && bestElevator.queue.length > 0) {
      bestElevator.targetFloor = bestElevator.queue[0];
      bestElevator.isMoving = true;
      bestElevator.direction = bestElevator.targetFloor > bestElevator.currentFloor ? 'up' : 'down';
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
        }
        continue;
      }

      if (elevator.queue.length === 0) {
        elevator.isMoving = false;
        elevator.direction = 'idle';
        elevator.targetFloor = null;
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
          // Достигли цели
          elevator.queue.shift(); // удаляем выполненную цель
          // Вызываем колбэки для этого этажа
          const reachedFloor = elevator.currentFloor;
          floorReachedCallbacks.forEach(cb => cb(reachedFloor));

          if (elevator.queue.length > 0) {
            elevator.targetFloor = elevator.queue[0];
            elevator.isWaiting = true;
            elevator.waitTimeRemaining = WAIT_TIME;
            elevator.isMoving = false;
          } else {
            elevator.targetFloor = null;
            elevator.isMoving = false;
            elevator.direction = 'idle';
          }
        }
      } else if (elevator.currentFloor > elevator.targetFloor) {
        elevator.currentFloor -= SPEED * deltaSeconds;
        if (elevator.currentFloor <= elevator.targetFloor) {
          elevator.currentFloor = elevator.targetFloor;
          elevator.queue.shift();
          const reachedFloor = elevator.currentFloor;
          floorReachedCallbacks.forEach(cb => cb(reachedFloor));

          if (elevator.queue.length > 0) {
            elevator.targetFloor = elevator.queue[0];
            elevator.isWaiting = true;
            elevator.waitTimeRemaining = WAIT_TIME;
            elevator.isMoving = false;
          } else {
            elevator.targetFloor = null;
            elevator.isMoving = false;
            elevator.direction = 'idle';
          }
        }
      }
    }
  };

  // === Подписка на событие достижения этажа ===
  const onFloorReached = (callback: (floor: number) => void) => {
    floorReachedCallbacks.push(callback);
  };

  // === Запуск/остановка симуляции ===
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