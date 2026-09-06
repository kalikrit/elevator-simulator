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

/**
 * Один шаг сценария: вызов на определённом этаже в заданный момент времени
 */
export interface ScenarioStep {
  floor: number;   // этаж, с которого вызывают (0..24)
  time: number;    // время в секундах от начала сценария
}

/**
 * Сценарий — набор вызовов, запланированных по времени
 */
export interface Scenario {
  id: string;          // уникальный идентификатор
  name: string;        // человекочитаемое название
  steps: ScenarioStep[];
}

/**
 * Метрики производительности для одного прогона алгоритма
 */
export interface Metrics {
  algorithmName: string;      // название алгоритма
  totalTime: number;          // общее время выполнения сценария (сек)
  averageWaitTime: number;    // среднее время ожидания (сек)
  maxWaitTime: number;        // максимальное время ожидания (сек)
  totalDistance: number;      // суммарный пробег всех лифтов (этажей)
  totalStops: number;         // общее число остановок
  callsCount: number;         // количество вызовов
  waitTimes: number[];        // массив времён ожидания для каждого вызова (сек)
}
