<template>
  <div class="building">
    <h1>🏢 Симулятор лифтов</h1>

    <div class="stats-bar">
      <div class="stat-item">Всего вызовов: {{ calls.length }}</div>
      <div class="stat-item">Активные лифты: {{ activeElevatorsCount }}</div>
    </div>

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
        <div class="call-buttons">
          <button
            v-if="floor < floors.length - 1"
            @click="handleCall(floor, 'up')"
            class="btn-up"
            :class="{ active: isCallActive(floor, 'up') }"
          >
            ▲
          </button>
          <button
            v-if="floor > 0"
            @click="handleCall(floor, 'down')"
            class="btn-down"
            :class="{ active: isCallActive(floor, 'down') }"
          >
            ▼
          </button>
        </div>
      </div>
    </div>

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
import type { Elevator, Direction } from '../types/elevator';

const { elevators, calls, callElevator } = useElevatorSystem();

const FLOORS = 25;
const floorHeight = 60;

const floors = computed(() => Array.from({ length: FLOORS }, (_, i) => i));

const elevatorsOnFloor = (floor: number) => {
  return elevators.filter(e => Math.round(e.currentFloor) === floor);
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

// === Подсветка активных вызовов ===
const activeCalls = ref<Map<number, Direction>>(new Map());

const handleCall = (floor: number, direction: Direction) => {
  // Добавляем в активные вызовы (для подсветки)
  activeCalls.value.set(floor, direction);
  // Вызываем лифт
  callElevator(floor, direction);

  // Снимаем подсветку через 10 секунд (или когда лифт приедет — логика может быть сложнее)
  setTimeout(() => {
    activeCalls.value.delete(floor);
  }, 10000);
};

const isCallActive = (floor: number, direction: Direction) => {
  return activeCalls.value.get(floor) === direction;
};
</script>

<style scoped lang="scss">
.building {
  max-width: 800px;
  margin: 20px auto;
  padding: 20px;
  background: #f0f4f8;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);

  h1 {
    text-align: center;
    margin-bottom: 10px;
    color: #2c3e50;
  }

  .stats-bar {
    display: flex;
    justify-content: center;
    gap: 30px;
    margin-bottom: 15px;
    background: #e2e8f0;
    padding: 8px 16px;
    border-radius: 8px;

    .stat-item {
      font-size: 14px;
      font-weight: 600;
      color: #2d3748;
    }
  }

  .floors {
    display: flex;
    flex-direction: column-reverse;
    gap: 2px;
    background: #e2e8f0;
    padding: 10px;
    border-radius: 8px;
    max-height: 600px;
    overflow-y: auto;
  }

  .floor {
    display: flex;
    align-items: center;
    background: white;
    padding: 0 10px;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    transition: background 0.2s;
    min-height: 50px;

    &:hover {
      background: #f7fafc;
    }

    .floor-number {
      width: 40px;
      font-weight: bold;
      color: #4a5568;
      font-size: 14px;
    }

    .elevator-shaft {
      flex: 1;
      display: flex;
      gap: 12px;
      justify-content: center;
      padding: 4px 0;
      min-height: 40px;
    }

    .elevator {
      width: 50px;
      height: 40px;
      background: #718096;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: space-around;
      padding: 0 6px;
      transition: background 0.3s, transform 0.2s;
      position: relative;

      .elevator-icon {
        font-size: 20px;
        line-height: 1;
      }

      .elevator-status {
        font-size: 10px;
        color: white;
        background: rgba(0,0,0,0.3);
        padding: 1px 4px;
        border-radius: 4px;
        white-space: nowrap;
      }

      &.elevator-moving {
        background: #4299e1;
        box-shadow: 0 0 8px rgba(66, 153, 225, 0.5);
      }

      &.elevator-up {
        background: #48bb78;
        .elevator-icon::after {
          content: ' ▲';
          font-size: 10px;
        }
      }

      &.elevator-down {
        background: #ed8936;
        .elevator-icon::after {
          content: ' ▼';
          font-size: 10px;
        }
      }
    }

    .call-buttons {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-left: 8px;

      button {
        border: none;
        background: #cbd5e0;
        color: #2d3748;
        width: 28px;
        height: 22px;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;

        &:hover {
          background: #a0aec0;
        }
        &:active {
          transform: scale(0.9);
        }

        &.btn-up {
          background: #48bb78;
          color: white;
          &:hover {
            background: #38a169;
          }
          &.active {
            background: #f6ad55;
            box-shadow: 0 0 12px #f6ad55;
          }
        }

        &.btn-down {
          background: #ed8936;
          color: white;
          &:hover {
            background: #dd6b20;
          }
          &.active {
            background: #f6ad55;
            box-shadow: 0 0 12px #f6ad55;
          }
        }
      }
    }
  }

  .elevator-status-list {
    margin-top: 20px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    background: #e2e8f0;
    padding: 10px;
    border-radius: 8px;

    .elevator-status-item {
      background: white;
      padding: 6px 12px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      flex-wrap: wrap;

      .elevator-id {
        font-weight: bold;
        color: #2c3e50;
      }
      .elevator-position {
        color: #4a5568;
      }
      .elevator-direction {
        font-size: 16px;
      }
      .elevator-queue {
        color: #718096;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 150px;
      }
    }
  }
}
</style>