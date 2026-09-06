<template>
  <div class="building">
    <h1>🏢 Симулятор лифтов</h1>

    <!-- Верхняя панель: статистика + кнопка переключения описания -->
    <div class="stats-bar">
      <div class="stat-item">Всего поездок: {{ trips.length }}</div>
      <div class="stat-item">Активных лифтов: {{ activeElevatorsCount }}</div>
      <button @click="isDescriptionVisible = !isDescriptionVisible" class="toggle-desc-btn" :title="isDescriptionVisible ? 'Скрыть описание' : 'Показать описание'">
        {{ isDescriptionVisible ? '📕' : '📗' }}
      </button>
    </div>

    <!-- Панель управления сценариями (без лишней кнопки) -->
    <div class="controls-panel">
      <div class="algorithm-selector">
        <label for="algorithm">Алгоритм:</label>
        <select id="algorithm" v-model="selectedAlgorithm">
          <option value="nearest">Ближайший доступный</option>
          <option value="totalTime">Прогнозирующий по полному времени</option>
        </select>
      </div>
      <button
        @click="runScenarioB"
        :disabled="isScenarioRunning"
        class="btn-run"
      >
        {{ isScenarioRunning ? '⏳ Выполняется...' : '🚀 Запустить сценарий B' }}
      </button>
      <button
        @click="resetAll"
        :disabled="isScenarioRunning"
        class="btn-reset"
      >
        🔄 Сбросить
      </button>
    </div>

    <!-- Блок описания (сворачиваемый) -->
    <div v-if="isDescriptionVisible" class="algorithm-description">
      <span class="algo-name">
        {{ selectedAlgorithm === 'nearest' ? 'Ближайший доступный' : 'Прогнозирующий по полному времени' }}
      </span>
      <span class="algo-desc">{{ algorithmDescription }}</span>
    </div>

    <!-- Блок метрик -->
    <div v-if="metrics" class="metrics-panel">
      <h3>📊 Результаты ({{ metrics.algorithmName }})</h3>
      <div class="metrics-grid">
        <div class="metric-item">
          <span class="metric-label">Общее время</span>
          <span class="metric-value">{{ metrics.totalTime.toFixed(2) }} с</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Среднее ожидание</span>
          <span class="metric-value">{{ metrics.averageWaitTime.toFixed(2) }} с</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Макс. ожидание</span>
          <span class="metric-value">{{ metrics.maxWaitTime.toFixed(2) }} с</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Суммарный пробег</span>
          <span class="metric-value">{{ metrics.totalDistance }} эт.</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Остановки</span>
          <span class="metric-value">{{ metrics.totalStops }}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Вызовов</span>
          <span class="metric-value">{{ metrics.callsCount }}</span>
        </div>
      </div>
      <div v-if="metrics.waitTimes.length" class="wait-times">
        <span class="wait-label">Времена ожидания (с):</span>
        <span class="wait-values">{{ metrics.waitTimes.map(t => t.toFixed(2)).join(', ') }}</span>
      </div>
    </div>

    <!-- Этажи -->
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
import type { Elevator, Metrics, ScenarioStep } from '../types/elevator';

const {
  elevators,
  trips,
  requestTrip,
  onFloorReached,
  runScenario,
  resetElevators,
  onCallMade,
  onElevatorArrived,
  onScenarioCompleted,
  isScenarioRunning,
} = useElevatorSystem();

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

// === Активные вызовы ===
const activeCalls = ref<Map<number, boolean>>(new Map());

// === Переменные для метрик и алгоритма ===
const selectedAlgorithm = ref<'nearest' | 'totalTime'>('nearest');
const metrics = ref<Metrics | null>(null);
const isDescriptionVisible = ref(true);

// === Описания алгоритмов ===
const algorithmDescriptions = {
  nearest: 'Выбирает ближайший свободный лифт. Оптимален при малой нагрузке, но может быть неэффективен при большом количестве вызовов, так как не учитывает долгосрочные очереди.',
  totalTime: 'Прогнозирует полное время завершения поездки для каждого лифта (с учётом текущей очереди и остановок) и выбирает минимальное. Снижает среднее время ожидания в пиковые нагрузки.'
};
const algorithmDescription = computed(() => algorithmDescriptions[selectedAlgorithm.value]);

// === Подписка на события ===
onMounted(() => {
  onFloorReached((floor: number) => {
    if (activeCalls.value.has(floor)) {
      activeCalls.value.delete(floor);
    }
  });

  onScenarioCompleted((receivedMetrics: Metrics) => {
    metrics.value = receivedMetrics;
    // Показываем описание после завершения сценария
    isDescriptionVisible.value = true;
  });
});

const runScenarioB = () => {
  metrics.value = null;
  // Скрываем описание при запуске
  isDescriptionVisible.value = false;
  const algorithmName = selectedAlgorithm.value === 'nearest' ? 'Ближайший доступный' : 'Прогнозирующий по полному времени';
  runScenario('scenarioB', algorithmName);
};

const resetAll = () => {
  resetElevators();
  metrics.value = null;
  activeCalls.value.clear();
  isDescriptionVisible.value = true;
};

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
  align-items: center;
  gap: 20px;
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

  .toggle-desc-btn {
    border: none;
    background: transparent;
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    transition: transform 0.2s;
    &:hover {
      transform: scale(1.2);
    }
  }
}

.controls-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 8px;
  padding: 8px 12px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  flex-shrink: 0;

  .algorithm-selector {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 500;
    color: #2d3748;

    select {
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid #cbd5e0;
      background: #f7fafc;
      font-size: 14px;
      cursor: pointer;
      &:focus {
        outline: none;
        border-color: #4299e1;
      }
    }
  }

  .btn-run,
  .btn-reset {
    border: none;
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
    &:active:not(:disabled) {
      transform: scale(0.96);
    }
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .btn-run {
    background: #48bb78;
    color: white;
    &:hover:not(:disabled) {
      background: #38a169;
    }
  }

  .btn-reset {
    background: #edf2f7;
    color: #2d3748;
    &:hover:not(:disabled) {
      background: #e2e8f0;
    }
  }
}

.algorithm-description {
  margin: 8px 0 12px 0;
  padding: 10px 14px;
  background: #edf2f7;
  border-left: 4px solid #4299e1;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  text-align: left;

  .algo-name {
    font-weight: 700;
    font-size: 15px;
    color: #2d3748;
  }
  .algo-desc {
    font-size: 14px;
    color: #4a5568;
    line-height: 1.4;
  }
}

.metrics-panel {
  margin-bottom: 10px;
  padding: 12px 16px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  flex-shrink: 0;

  h3 {
    margin: 0 0 8px 0;
    font-size: 16px;
    color: #2d3748;
    text-align: center;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
    margin-bottom: 8px;

    .metric-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #f7fafc;
      padding: 6px 8px;
      border-radius: 6px;

      .metric-label {
        font-size: 11px;
        color: #718096;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .metric-value {
        font-size: 18px;
        font-weight: 600;
        color: #2d3748;
      }
    }
  }

  .wait-times {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
    font-size: 13px;
    color: #4a5568;

    .wait-label {
      font-weight: 500;
    }
    .wait-values {
      font-family: monospace;
      background: #edf2f7;
      padding: 2px 8px;
      border-radius: 4px;
      word-break: break-all;
    }
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