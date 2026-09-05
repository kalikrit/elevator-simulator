// src/types/elevator.ts

export type Direction = 'up' | 'down' | 'idle';

export interface Elevator {
  id: number;
  currentFloor: number;
  targetFloor: number | null;
  direction: Direction;
  isMoving: boolean;
  passengers: number;
  queue: number[];
  isWaiting: boolean;          // флаг ожидания
  waitTimeRemaining: number;   // оставшееся время ожидания в мс
}

// Поездка: вызов с указанием этажа назначения
export interface Trip {
  from: number;      // этаж, где вызвали лифт
  to: number;        // этаж назначения
  timestamp: number; // время вызова
}