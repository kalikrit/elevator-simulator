// src/composables/useElevatorSystem.ts

import { reactive, onMounted, onUnmounted } from 'vue';
import type { Elevator, Trip, Direction } from '../types/elevator';

const FLOORS = 25;
const ELEVATOR_COUNT = 4;
const SPEED = 1; // этажей в секунду
const WAIT_TIME = 5000; // 5 секунд ожидания на промежуточных остановках

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

  // Оценка времени всей поездки с учётом ожиданий
  const estimateTotalTime = (elevator: Elevator, from: number, to: number): number => {
    // Если лифт стоит и очередь пуста
    if (!elevator.isMoving && elevator.queue.length === 0 && !elevator.isWaiting) {
      return Math.abs(elevator.currentFloor - from) + Math.abs(from - to);
    }

    // Моделируем прохождение очереди и новой поездки
    let current = elevator.currentFloor;
    let total = 0;
    // Проходим по всем целям в очереди
    for (let i = 0; i < elevator.queue.length; i++) {
      const target = elevator.queue[i];
      total += Math.abs(current - target);
      current = target;
      // Если это не последняя цель в очереди, добавляем время ожидания
      if (i < elevator.queue.length - 1) {
        total += WAIT_TIME / 1000; // переводим в секунды для оценки
      }
    }
    // Добавляем поездку от последней цели до from и от from до to
    total += Math.abs(current - from) + Math.abs(from - to);
    // Если from не является последней целью, добавляем ожидание на from
    // (мы всегда ждём на from, если есть to)
    total += WAIT_TIME / 1000;
    return total;
  };

  // Запрос поездки
  const requestTrip = (fromFloor: number, toFloor: number) => {
    if (fromFloor === toFloor) {
      console.warn('Начальный и конечный этажи совпадают');
      return;
    }

    let bestElevator: Elevator | null = null;
    let bestTime = Infinity;

    for (const elevator of elevators) {
      const time = estimateTotalTime(elevator, fromFloor, toFloor);
      if (time < bestTime) {
        bestTime = time;
        bestElevator = elevator;
      }
    }

    if (bestElevator) {
      // Добавляем в очередь оба этажа, если их там ещё нет
      if (!bestElevator.queue.includes(fromFloor)) {
        bestElevator.queue.push(fromFloor);
      }
      if (!bestElevator.queue.includes(toFloor)) {
        bestElevator.queue.push(toFloor);
      }

      // Если лифт стоял и не ждёт, запускаем его
      if (!bestElevator.isMoving && !bestElevator.isWaiting && bestElevator.queue.length > 0) {
        bestElevator.targetFloor = bestElevator.queue[0];
        bestElevator.isMoving = true;
        bestElevator.direction = bestElevator.targetFloor > bestElevator.currentFloor ? 'up' : 'down';
      }
    }

    trips.push({ from: fromFloor, to: toFloor, timestamp: Date.now() });
  };

  // Обновление состояния лифтов (тик)
  const updateElevators = (deltaMs: number) => {
    const deltaSeconds = deltaMs / 1000;

    for (const elevator of elevators) {
      // === Обработка ожидания ===
      if (elevator.isWaiting) {
        elevator.waitTimeRemaining -= deltaMs;
        if (elevator.waitTimeRemaining <= 0) {
          // Выходим из ожидания: удаляем выполненную цель
          elevator.queue.shift();
          elevator.targetFloor = elevator.queue[0] || null;
          elevator.isWaiting = false;
          elevator.isMoving = true;
          if (elevator.targetFloor !== null) {
            elevator.direction = elevator.targetFloor > elevator.currentFloor ? 'up' : 'down';
          } else {
            elevator.isMoving = false;
            elevator.direction = 'idle';
          }
        }
        continue; // пока ждём, не двигаемся
      }

      // === Если очередь пуста ===
      if (elevator.queue.length === 0) {
        elevator.isMoving = false;
        elevator.direction = 'idle';
        elevator.targetFloor = null;
        continue;
      }

      // === Если нет текущей цели ===
      if (elevator.targetFloor === null) {
        elevator.targetFloor = elevator.queue[0];
        elevator.direction = elevator.targetFloor > elevator.currentFloor ? 'up' : 'down';
        elevator.isMoving = true;
      }

      // === Движение к цели ===
      if (elevator.currentFloor < elevator.targetFloor) {
        elevator.currentFloor += SPEED * deltaSeconds;
        elevator.direction = 'up';
        if (elevator.currentFloor >= elevator.targetFloor) {
          elevator.currentFloor = elevator.targetFloor;
          // Достигли цели
          if (elevator.queue.length > 1) {
            // Если есть ещё цели — начинаем ожидание
            elevator.isWaiting = true;
            elevator.waitTimeRemaining = WAIT_TIME;
            elevator.isMoving = false;
          } else {
            // Если это последняя цель — удаляем и останавливаемся
            elevator.queue.shift();
            elevator.targetFloor = null;
            elevator.isMoving = false;
            elevator.direction = 'idle';
          }
        }
      } else if (elevator.currentFloor > elevator.targetFloor) {
        elevator.currentFloor -= SPEED * deltaSeconds;
        elevator.direction = 'down';
        if (elevator.currentFloor <= elevator.targetFloor) {
          elevator.currentFloor = elevator.targetFloor;
          if (elevator.queue.length > 1) {
            elevator.isWaiting = true;
            elevator.waitTimeRemaining = WAIT_TIME;
            elevator.isMoving = false;
          } else {
            elevator.queue.shift();
            elevator.targetFloor = null;
            elevator.isMoving = false;
            elevator.direction = 'idle';
          }
        }
      }
    }
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

  onMounted(() => {
    startSimulation();
  });

  onUnmounted(() => {
    stopSimulation();
  });

  return { elevators, trips, requestTrip };
}