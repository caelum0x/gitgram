import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/Colors';

interface ReelTrimEditorProps {
  duration: number;
  startTime: number;
  endTime: number;
  onChange: (startTime: number, endTime: number) => void;
  onPreview?: () => void;
}

const MIN_CLIP_LENGTH_SECONDS = 1;
const TRIM_STEP_SECONDS = 1;

const roundToTenth = (value: number) => Math.round(value * 10) / 10;

const clamp = (value: number, min: number, max: number) => (
  Math.min(Math.max(value, min), max)
);

const formatDuration = (seconds: number) => {
  const normalized = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(normalized / 60);
  const remainingSeconds = normalized - minutes * 60;
  const paddedSeconds = remainingSeconds < 10 ? `0${remainingSeconds.toFixed(1)}` : remainingSeconds.toFixed(1);

  return `${minutes}:${paddedSeconds}`;
};

export default function ReelTrimEditor({
  duration,
  startTime,
  endTime,
  onChange,
  onPreview,
}: ReelTrimEditorProps) {
  if (!(duration > 0)) {
    return null;
  }

  const minClipLength = Math.min(MIN_CLIP_LENGTH_SECONDS, duration);
  const normalizedEnd = endTime > 0 ? Math.min(endTime, duration) : duration;
  const clipDuration = Math.max(minClipLength, roundToTenth(normalizedEnd - startTime));
  const leftPercent = duration > 0 ? (startTime / duration) * 100 : 0;
  const rightPercent = duration > 0 ? Math.max(0, 100 - (normalizedEnd / duration) * 100) : 0;

  const updateStartTime = (delta: number) => {
    const nextStart = roundToTenth(
      clamp(startTime + delta, 0, Math.max(0, normalizedEnd - minClipLength))
    );
    onChange(nextStart, normalizedEnd);
  };

  const updateEndTime = (delta: number) => {
    const nextEnd = roundToTenth(
      clamp(normalizedEnd + delta, Math.min(duration, startTime + minClipLength), duration)
    );
    onChange(startTime, nextEnd);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Trim Clip</Text>
          <Text style={styles.subtitle}>Preview loops between the selected points.</Text>
        </View>
        <TouchableOpacity onPress={() => onChange(0, duration)}>
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.timelineCard}>
        <View style={styles.timelineTrack}>
          <View
            style={[
              styles.timelineSelection,
              {
                left: `${leftPercent}%`,
                right: `${rightPercent}%`,
              },
            ]}
          />
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>Start</Text>
            <Text style={styles.summaryValue}>{formatDuration(startTime)}</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>End</Text>
            <Text style={styles.summaryValue}>{formatDuration(normalizedEnd)}</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>Clip</Text>
            <Text style={styles.summaryValue}>{formatDuration(clipDuration)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.controlRow}>
        <View style={styles.controlCard}>
          <Text style={styles.controlTitle}>Start</Text>
          <Text style={styles.controlValue}>{formatDuration(startTime)}</Text>
          <View style={styles.adjustRow}>
            <TouchableOpacity style={styles.adjustButton} onPress={() => updateStartTime(-TRIM_STEP_SECONDS)}>
              <Text style={styles.adjustButtonText}>-1s</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.adjustButton} onPress={() => updateStartTime(TRIM_STEP_SECONDS)}>
              <Text style={styles.adjustButtonText}>+1s</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.controlCard}>
          <Text style={styles.controlTitle}>End</Text>
          <Text style={styles.controlValue}>{formatDuration(normalizedEnd)}</Text>
          <View style={styles.adjustRow}>
            <TouchableOpacity style={styles.adjustButton} onPress={() => updateEndTime(-TRIM_STEP_SECONDS)}>
              <Text style={styles.adjustButtonText}>-1s</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.adjustButton} onPress={() => updateEndTime(TRIM_STEP_SECONDS)}>
              <Text style={styles.adjustButtonText}>+1s</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {onPreview && (
        <TouchableOpacity style={styles.previewButton} onPress={onPreview}>
          <Text style={styles.previewButtonText}>Preview Trimmed Clip</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  resetText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  timelineCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 14,
  },
  timelineTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: Colors.background,
    overflow: 'hidden',
    position: 'relative',
  },
  timelineSelection: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: Colors.accent,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryChip: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  controlRow: {
    flexDirection: 'row',
    gap: 12,
  },
  controlCard: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 10,
  },
  controlTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  controlValue: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  adjustRow: {
    flexDirection: 'row',
    gap: 8,
  },
  adjustButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: Colors.background,
    paddingVertical: 10,
  },
  adjustButtonText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  previewButton: {
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  previewButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
