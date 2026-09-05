// src/types/elevator.ts

export type Direction = 'up' | 'down' | 'idle';

export interface Elevator {
  id: number;
  currentFloor: number;
  targetFloor: number | null; // первая цель из очереди (для совместимости)
  direction: Direction;
  isMoving: boolean;
  passengers: number;
  queue: number[]; // все цели в порядке посещения
}

export interface Call {
  floor: number;             // откуда вызывают
  direction: Direction;      // куда ехать (up/down)
  timestamp: number;         // время вызова (для статистики)
}

export type Floor = number;  // 0..24