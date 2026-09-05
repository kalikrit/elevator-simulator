<template>
  <div class="building">
    <h1>🏢 Симулятор лифтов</h1>

    <!-- Верхняя панель с управлением -->
    <div class="controls">
      <div class="control-group">
        <label for="destination">Куда едем?</label>
        <input
          id="destination"
          type="number"
          v-model.number="destinationTo"
          :min="1"
          :max="FLOORS"
          placeholder="Этаж"
          class="dest-input"
        />
        <span class="hint">от 1 до {{ FLOORS }}</span>
      </div>
      <div class="stats">
        <span>Всего поездок: {{ trips.length }}</span>
        <span>Активных лифтов: {{ activeElevatorsCount }}</span>
      </div>
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

        <!-- Кнопка вызова с указанием назначения -->
        <div class="call-button">
          <button
            @click="handleCall(floor)"
            class="btn-call"
            :class="{ active: isCallActive(floor) }"
            :disabled="!isValidDestination"
          >
            🛗 Вызвать
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
const floorHeight = 60;

const floors = computed(() => Array.from({ length: FLOORS }, (_, i) => i));

const destinationTo = ref<number>(1); // по умолчанию 1-й этаж

// Проверка валидности введённого этажа
const isValidDestination = computed(() => {
  return destinationTo.value >= 1 && destinationTo.value <= FLOORS;
});

// Лифты на конкретном этаже (с округлением)
const elevatorsOnFloor = (floor: number) => {
  return elevators.filter(
    (e) => Math.round(e.currentFloor) === floor
  );
};

// Количество движущихся лифтов
const activeElevatorsCount = computed(() =>
  elevators.filter(e => e.isMoving).length
);

// Статус лифта для отображения на иконке
const getElevatorStatus = (elevator: Elevator): string => {
  if (!elevator.isMoving) return '⏹';
  if (elevator.targetFloor !== null) {
    return `⬆ ${elevator.targetFloor + 1}`;
  }
  return '⏳';
};

// === Активные вызовы для подсветки кнопок ===
const activeCalls = ref<Map<number, boolean>>(new Map());

const handleCall = (fromFloor: number) => {
  if (!isValidDestination.value) return;
  const toFloor = destinationTo.value - 1; // переводим в 0-индексацию
  if (fromFloor === toFloor) {
    alert('Начальный и конечный этажи совпадают!');
    return;
  }

  // Добавляем в активные вызовы (для подсветки)
  activeCalls.value.set(fromFloor, true);

  // Вызываем лифт с указанием назначения
  requestTrip(fromFloor, toFloor);

  // Снимаем подсветку через 10 секунд (можно доработать, чтобы снималась после прибытия)
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
  max-width: 800px;
  margin: 20px auto;
  padding: 20px;
  background: #f0f4f8;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);

  h1 {
    text-align: center;
    margin-bottom: 15px;
    color: #2c3e50;
  }

  .controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #e2e8f0;
    padding: 10px 16px;
    border-radius: 8px;
    margin-bottom: 15px;
    flex-wrap: wrap;
    gap: 10px;

    .control-group {
      display: flex;
      align-items: center;
      gap: 8px;

      label {
        font-weight: 600;
        color: #2d3748;
      }

      .dest-input {
        width: 60px;
        padding: 6px 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 14px;
        text-align: center;
        outline: none;
        &:focus {
          border-color: #4299e1;
        }
      }

      .hint {
        font-size: 12px;
        color: #718096;
      }
    }

    .stats {
      display: flex;
      gap: 20px;
      font-size: 14px;
      font-weight: 500;
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

    .call-button {
      margin-left: 8px;
      .btn-call {
        border: none;
        background: #48bb78;
        color: white;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
        white-space: nowrap;

        &:hover:not(:disabled) {
          background: #38a169;
        }
        &:active:not(:disabled) {
          transform: scale(0.95);
        }
        &:disabled {
          background: #a0aec0;
          cursor: not-allowed;
          opacity: 0.6;
        }
        &.active {
          background: #f6ad55;
          box-shadow: 0 0 12px #f6ad55;
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