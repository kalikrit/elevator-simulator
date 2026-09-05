<template>
  <div class="building">
    <h1>🏢 Симулятор лифтов</h1>

    <div class="stats-bar">
      <div class="stat-item">Всего поездок: {{ trips.length }}</div>
      <div class="stat-item">Активных лифтов: {{ activeElevatorsCount }}</div>
    </div>

    <div class="floors">
      <div
        v-for="floor in floors"
        :key="floor"
        class="floor"
      >
        <div class="floor-number">{{ floor + 1 }}</div>

        <div class="elevator-shafts">
          <div
            v-for="(elevator, index) in elevators"
            :key="index"
            class="shaft"
          >
            <div
              v-if="Math.round(elevator.currentFloor) === floor"
              class="elevator"
              :class="{
                'elevator-moving': elevator.isMoving,
                'elevator-up': elevator.direction === 'up',
                'elevator-down': elevator.direction === 'down',
                'elevator-waiting': elevator.isWaiting,
              }"
            >
              <span class="elevator-icon">🚪</span>
              <span class="elevator-status">{{ getElevatorStatus(elevator) }}</span>
            </div>
            <div v-else class="empty-shaft"></div>
          </div>
        </div>

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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useElevatorSystem } from '../composables/useElevatorSystem';
import type { Elevator } from '../types/elevator';

const { elevators, trips, requestTrip, onFloorReached } = useElevatorSystem();

const FLOORS = 25;

const floors = computed(() => Array.from({ length: FLOORS }, (_, i) => i));

const activeElevatorsCount = computed(() =>
  elevators.filter(e => e.isMoving).length
);

const getElevatorStatus = (elevator: Elevator): string => {
  if (elevator.isWaiting) return '⏳';
  if (!elevator.isMoving) return '⏹';
  if (elevator.targetFloor !== null) {
    return `⬆ ${elevator.targetFloor + 1}`;
  }
  return '⏳';
};

// === Активные вызовы для подсветки кнопок ===
const activeCalls = ref<Map<number, boolean>>(new Map());

// Подписка на событие достижения этажа
onMounted(() => {
  onFloorReached((floor: number) => {
    if (activeCalls.value.has(floor)) {
      activeCalls.value.delete(floor);
    }
  });
});

const handleCall = (fromFloor: number) => {
  activeCalls.value.set(fromFloor, true);
  requestTrip(fromFloor, 0);
};

const isCallActive = (floor: number) => {
  return activeCalls.value.get(floor) === true;
};
</script>

<style scoped lang="scss">
* {
  box-sizing: border-box;
}

.building {
  max-width: 800px;
  margin: 10px auto;
  padding: 10px 15px;
  background: #f0f4f8;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  height: 98vh;
  max-height: 100vh;
  overflow: hidden;
}

h1 {
  text-align: center;
  margin: 0 0 8px 0;
  font-size: 1.5rem;
  color: #2c3e50;
  flex-shrink: 0;
}

.stats-bar {
  display: flex;
  justify-content: center;
  gap: 30px;
  margin-bottom: 8px;
  background: #e2e8f0;
  padding: 6px 16px;
  border-radius: 8px;
  flex-shrink: 0;

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
  flex: 1 1 auto;
  overflow: hidden;
  padding: 4px 0;
}

.floor {
  display: flex;
  align-items: center;
  background: white;
  padding: 0 8px;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  min-height: 28px;
  height: calc((100% - 2px * 24) / 25);
  flex-shrink: 0;

  .floor-number {
    width: 30px;
    font-weight: bold;
    color: #4a5568;
    font-size: 12px;
    flex-shrink: 0;
  }

  .elevator-shafts {
    flex: 1;
    display: flex;
    gap: 4px;
    justify-content: space-around;
    padding: 2px 0;
    min-height: 24px;
  }

  .shaft {
    flex: 1;
    min-width: 30px;
    background: #e2e8f0;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    min-height: 24px;
  }

  .elevator {
    width: 90%;
    height: 80%;
    background: #718096;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: 0 4px;
    transition: background 0.3s;

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
      box-shadow: 0 0 6px rgba(66, 153, 225, 0.4);
    }
    &.elevator-up {
      background: #48bb78;
    }
    &.elevator-down {
      background: #ed8936;
    }
    &.elevator-waiting {
      background: #f6ad55;
      animation: pulse 1s infinite;
    }
  }

  .empty-shaft {
    width: 90%;
    height: 80%;
    background: transparent;
    border: 1px dashed #cbd5e0;
    border-radius: 4px;
  }

  .call-button {
    margin-left: 8px;
    flex-shrink: 0;
    width: 32px;
    display: flex;
    justify-content: center;

    .btn-call {
      border: none;
      background: #48bb78;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;

      &:hover {
        background: #38a169;
      }
      &:active {
        transform: scale(0.9);
      }
      &.active {
        background: #f6ad55;
        box-shadow: 0 0 12px #f6ad55;
      }
    }
  }
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.6; }
  100% { opacity: 1; }
}
</style>