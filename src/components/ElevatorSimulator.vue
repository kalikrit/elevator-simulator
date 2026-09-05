<template>
  <div class="building">
    <h1>🏢 Симулятор лифтов</h1>

    <!-- Верхняя панель со статистикой -->
    <div class="stats-bar">
      <span>Всего поездок: {{ trips.length }}</span>
      <span>Активных лифтов: {{ activeElevatorsCount }}</span>
    </div>

    <!-- Этажи -->
    <div class="floors">
      <div
        v-for="floor in floors"
        :key="floor"
        class="floor"
        :style="{ height: floorHeight + 'px' }"
      >
        <div class="floor-number">{{ floor + 1 }}</div>

        <div class="elevator-shaft">
          <div
            v-for="elevator in elevatorsOnFloor(floor)"
            :key="elevator.id"
            class="elevator"
            :class="{
              'elevator-moving': elevator.isMoving,
              'elevator-up': elevator.direction === 'up',
              'elevator-down': elevator.direction === 'down',
            }"
          >
            <span class="elevator-icon">🚪</span>
            <span class="elevator-status">{{ getElevatorStatus(elevator) }}</span>
          </div>
        </div>

        <!-- Кнопка вызова -->
        <div class="call-button">
          <button
            @click="handleCall(floor)"
            class="btn-call"
            :class="{ active: isCallActive(floor) }"
          >
            🛗
          </button>
        </div>
      </div>
    </div>

    <!-- Нижняя панель состояния лифтов -->
    <div class="elevator-status-list">
      <div
        v-for="elevator in elevators"
        :key="elevator.id"
        class="elevator-status-item"
      >
        <span class="elevator-id">Лифт #{{ elevator.id + 1 }}</span>
        <span class="elevator-position">Этаж: {{ Math.round(elevator.currentFloor) + 1 }}</span>
        <span class="elevator-direction">
          {{ elevator.direction === 'up' ? '⬆' : elevator.direction === 'down' ? '⬇' : '⏸' }}
        </span>
        <span class="elevator-queue">
          Очередь: {{ elevator.queue.map(f => f + 1).join(' → ') || '—' }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useElevatorSystem } from '../composables/useElevatorSystem';
import type { Elevator } from '../types/elevator';

const { elevators, trips, requestTrip } = useElevatorSystem();

const FLOORS = 25;
const floorHeight = 30; // уменьшили высоту этажа

const floors = computed(() => Array.from({ length: FLOORS }, (_, i) => i));

// Лифты на этаже
const elevatorsOnFloor = (floor: number) => {
  return elevators.filter(
    (e) => Math.round(e.currentFloor) === floor
  );
};

const activeElevatorsCount = computed(() =>
  elevators.filter(e => e.isMoving).length
);

const getElevatorStatus = (elevator: Elevator): string => {
  if (!elevator.isMoving) return '⏹';
  if (elevator.targetFloor !== null) {
    return `⬆ ${elevator.targetFloor + 1}`;
  }
  return '⏳';
};

// Активные вызовы для подсветки кнопок
const activeCalls = ref<Map<number, boolean>>(new Map());

// Обработчик вызова (всегда на первый этаж)
const handleCall = (fromFloor: number) => {
  const toFloor = 0; // всегда первый этаж
  if (fromFloor === toFloor) {
    alert('Вы уже на первом этаже!');
    return;
  }

  activeCalls.value.set(fromFloor, true);
  requestTrip(fromFloor, toFloor);

  setTimeout(() => {
    activeCalls.value.delete(fromFloor);
  }, 10000);
};

const isCallActive = (floor: number) => {
  return activeCalls.value.get(floor) === true;
};
</script>

<style scoped lang="scss">
.building {
  max-width: 700px;
  margin: 10px auto;
  padding: 10px;
  background: #f0f4f8;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  width: 100%;
  box-sizing: border-box;

  h1 {
    text-align: center;
    margin-bottom: 5px;
    color: #2c3e50;
    font-size: 20px;
  }

  .stats-bar {
    display: flex;
    justify-content: center;
    gap: 30px;
    margin-bottom: 10px;
    background: #e2e8f0;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    color: #2d3748;
  }

  .floors {
    display: flex;
    flex-direction: column-reverse;
    gap: 2px;
    background: #e2e8f0;
    padding: 6px;
    border-radius: 8px;
    max-height: calc(25 * 30px + 20px); // 25 этажей * 30px + отступы
    overflow: hidden; // убрали прокрутку
  }

  .floor {
    display: flex;
    align-items: center;
    background: white;
    padding: 0 6px;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    transition: background 0.2s;
    min-height: 28px;
    height: 28px; // фиксированная высота для компактности
    width: 100%; // чтобы не дергалось
    box-sizing: border-box;

    &:hover {
      background: #f7fafc;
    }

    .floor-number {
      width: 28px;
      font-weight: bold;
      color: #4a5568;
      font-size: 12px;
      flex-shrink: 0;
    }

    .elevator-shaft {
      flex: 1;
      display: flex;
      gap: 8px;
      justify-content: center;
      padding: 2px 0;
      min-height: 26px;
    }

    .elevator {
      width: 36px;
      height: 26px;
      background: #718096;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: space-around;
      padding: 0 4px;
      transition: background 0.3s, transform 0.2s;
      position: relative;

      .elevator-icon {
        font-size: 14px;
        line-height: 1;
      }

      .elevator-status {
        font-size: 8px;
        color: white;
        background: rgba(0,0,0,0.3);
        padding: 1px 3px;
        border-radius: 3px;
        white-space: nowrap;
      }

      &.elevator-moving {
        background: #4299e1;
        box-shadow: 0 0 6px rgba(66, 153, 225, 0.5);
      }

      &.elevator-up {
        background: #48bb78;
        .elevator-icon::after {
          content: ' ▲';
          font-size: 8px;
        }
      }

      &.elevator-down {
        background: #ed8936;
        .elevator-icon::after {
          content: ' ▼';
          font-size: 8px;
        }
      }
    }

    .call-button {
      margin-left: 4px;
      flex-shrink: 0;
      .btn-call {
        border: none;
        background: #48bb78;
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
        line-height: 1.2;
        min-width: 28px;
        text-align: center;

        &:hover:not(:disabled) {
          background: #38a169;
        }
        &:active:not(:disabled) {
          transform: scale(0.9);
        }
        &:disabled {
          background: #a0aec0;
          cursor: not-allowed;
          opacity: 0.6;
        }
        &.active {
          background: #f6ad55;
          box-shadow: 0 0 8px #f6ad55;
        }
      }
    }
  }

  .elevator-status-list {
    margin-top: 10px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    background: #e2e8f0;
    padding: 6px;
    border-radius: 8px;

    .elevator-status-item {
      background: white;
      padding: 4px 8px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      flex-wrap: wrap;

      .elevator-id {
        font-weight: bold;
        color: #2c3e50;
      }
      .elevator-position {
        color: #4a5568;
      }
      .elevator-direction {
        font-size: 14px;
      }
      .elevator-queue {
        color: #718096;
        font-size: 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 120px;
      }
    }
  }
}
</style>