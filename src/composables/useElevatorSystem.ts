// src/composables/useElevatorSystem.ts

import { reactive, onMounted, onUnmounted } from 'vue';
import type { Elevator, Call, Direction } from '../types/elevator';

const FLOORS = 25;
const ELEVATOR_COUNT = 4;
const SPEED = 1; // этажей в секунду

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
    }))
  );

  const calls = reactive<Call[]>([]);
  let intervalId: number | null = null;

  // Оценка времени прибытия (для выбора лучшего лифта)
  const estimateArrivalTime = (elevator: Elevator, targetFloor: number): number => {
    if (!elevator.isMoving || elevator.queue.length === 0) {
      return Math.abs(elevator.currentFloor - targetFloor);
    }
    const lastTarget = elevator.queue[elevator.queue.length - 1];
    const distanceToLast = Math.abs(lastTarget - elevator.currentFloor);
    const distanceToNew = Math.abs(lastTarget - targetFloor);
    return distanceToLast + distanceToNew;
  };

  // Вызов лифта пользователем
  const callElevator = (floor: number, direction: Direction) => {
    let bestElevator: Elevator | null = null;
    let bestTime = Infinity;

    for (const elevator of elevators) {
      const estimatedTime = estimateArrivalTime(elevator, floor);
      if (estimatedTime < bestTime) {
        bestTime = estimatedTime;
        bestElevator = elevator;
      }
    }

    if (bestElevator) {
      if (!bestElevator.queue.includes(floor)) {
        bestElevator.queue.push(floor);
      }
      if (!bestElevator.isMoving && bestElevator.queue.length > 0) {
        bestElevator.targetFloor = bestElevator.queue[0];
        bestElevator.isMoving = true;
        bestElevator.direction = bestElevator.targetFloor > bestElevator.currentFloor ? 'up' : 'down';
      }
    }

    calls.push({ floor, direction, timestamp: Date.now() });
  };

  // Обновление состояния лифтов (тик)
  const updateElevators = () => {
    for (const elevator of elevators) {
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

      if (elevator.currentFloor < elevator.targetFloor) {
        elevator.currentFloor += SPEED;
        elevator.direction = 'up';
        if (elevator.currentFloor >= elevator.targetFloor) {
          elevator.currentFloor = elevator.targetFloor;
          elevator.queue.shift();
          elevator.targetFloor = elevator.queue[0] || null;
          if (elevator.targetFloor === null) {
            elevator.isMoving = false;
            elevator.direction = 'idle';
          }
        }
      } else if (elevator.currentFloor > elevator.targetFloor) {
        elevator.currentFloor -= SPEED;
        elevator.direction = 'down';
        if (elevator.currentFloor <= elevator.targetFloor) {
          elevator.currentFloor = elevator.targetFloor;
          elevator.queue.shift();
          elevator.targetFloor = elevator.queue[0] || null;
          if (elevator.targetFloor === null) {
            elevator.isMoving = false;
            elevator.direction = 'idle';
          }
        }
      } else {
        elevator.queue.shift();
        elevator.targetFloor = elevator.queue[0] || null;
        if (elevator.targetFloor === null) {
          elevator.isMoving = false;
          elevator.direction = 'idle';
        }
      }
    }
  };

  const startSimulation = () => {
    if (intervalId) return;
    intervalId = setInterval(updateElevators, 1000 / 60);
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

  return { elevators, calls, callElevator };
}