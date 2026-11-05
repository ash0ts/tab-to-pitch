"""Basic Pitch Apache-2.0 decoder, ported through Toraneko; see PROVENANCE.md."""
from __future__ import annotations
from typing import Any

class BasicPitchDecoder:
    SOURCE_COMMIT = 'fa5997af0a8210982619003269994a1be25eddf3'
    MODEL_SHA256 = '2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec'
    SAMPLE_RATE = 22050
    FFT_HOP = 256
    WINDOW_SAMPLES = SAMPLE_RATE * 2 - FFT_HOP
    OVERLAP_FRAMES = 30
    ANNOTATION_FRAMES = SAMPLE_RATE // FFT_HOP * 2

    @classmethod
    def _infer(cls, session: Any, audio: Any, np: Any) -> tuple[Any, Any]:
        overlap_samples = cls.OVERLAP_FRAMES * cls.FFT_HOP
        hop_size = cls.WINDOW_SAMPLES - overlap_samples
        padded = np.concatenate([np.zeros(overlap_samples // 2, dtype=np.float32), audio])
        notes: list[Any] = []
        onsets: list[Any] = []
        for offset in range(0, len(padded), hop_size):
            window = padded[offset:offset + cls.WINDOW_SAMPLES]
            if len(window) < cls.WINDOW_SAMPLES:
                window = np.pad(window, (0, cls.WINDOW_SAMPLES - len(window)))
            batch = np.expand_dims(np.expand_dims(window, -1), 0).astype(np.float32)
            note_output, onset_output, _contour = session.run(['StatefulPartitionedCall:1', 'StatefulPartitionedCall:2', 'StatefulPartitionedCall:0'], {'serving_default_input_2:0': batch})
            notes.append(note_output)
            onsets.append(onset_output)
        return (cls._unwrap(np.concatenate(notes), len(audio), hop_size, np), cls._unwrap(np.concatenate(onsets), len(audio), hop_size, np))

    @classmethod
    def _unwrap(cls, output: Any, audio_samples: int, hop_size: int, np: Any) -> Any:
        trim = cls.OVERLAP_FRAMES // 2
        output = output[:, trim:-trim, :]
        unwrapped = output.reshape(output.shape[0] * output.shape[1], output.shape[2])
        frames_per_window = cls.ANNOTATION_FRAMES - cls.OVERLAP_FRAMES
        expected = int(audio_samples / hop_size * frames_per_window)
        return np.asarray(unwrapped[:expected], dtype=np.float32)

    @staticmethod
    def _events(frames: Any, onsets: Any, argrelmax: Any, np: Any) -> list[tuple[int, int, int, float]]:
        differences = []
        for distance in (1, 2):
            padded = np.concatenate([np.zeros((distance, frames.shape[1])), frames])
            differences.append(padded[distance:, :] - padded[:-distance, :])
        frame_difference = np.min(differences, axis=0)
        frame_difference[frame_difference < 0] = 0
        frame_difference[:2, :] = 0
        maximum_difference = float(np.max(frame_difference))
        if maximum_difference > 0:
            frame_difference = float(np.max(onsets)) * frame_difference / maximum_difference
            onsets = np.max([onsets, frame_difference], axis=0)
        peaks = np.zeros_like(onsets)
        peak_indices = argrelmax(onsets, axis=0)
        peaks[peak_indices] = onsets[peak_indices]
        times, pitches = np.where(peaks >= 0.5)
        remaining = np.zeros(frames.shape)
        remaining[:, :] = frames[:, :]
        events: list[tuple[int, int, int, float]] = []
        for start, pitch_index in reversed(list(zip(times.tolist(), pitches.tolist(), strict=True))):
            if start >= len(frames) - 1:
                continue
            end = start + 1
            quiet = 0
            while end < len(frames) - 1 and quiet < 11:
                quiet = quiet + 1 if remaining[end, pitch_index] < 0.3 else 0
                end += 1
            end -= quiet
            if end - start <= 11:
                continue
            activation = float(np.mean(frames[start:end, pitch_index]))
            remaining[start:end, pitch_index] = 0
            if pitch_index < 87:
                remaining[start:end, pitch_index + 1] = 0
            if pitch_index > 0:
                remaining[start:end, pitch_index - 1] = 0
            events.append((start, end, pitch_index + 21, activation))
        while remaining.size and float(np.max(remaining)) > 0.3:
            seed, pitch_index = np.unravel_index(np.argmax(remaining), remaining.shape)
            remaining[seed, pitch_index] = 0
            end = int(seed) + 1
            quiet = 0
            while end < len(frames) - 1 and quiet < 11:
                quiet = quiet + 1 if remaining[end, pitch_index] < 0.3 else 0
                remaining[end, pitch_index] = 0
                if pitch_index < 87:
                    remaining[end, pitch_index + 1] = 0
                if pitch_index > 0:
                    remaining[end, pitch_index - 1] = 0
                end += 1
            end = end - 1 - quiet
            start = int(seed) - 1
            quiet = 0
            while start > 0 and quiet < 11:
                quiet = quiet + 1 if remaining[start, pitch_index] < 0.3 else 0
                remaining[start, pitch_index] = 0
                if pitch_index < 87:
                    remaining[start, pitch_index + 1] = 0
                if pitch_index > 0:
                    remaining[start, pitch_index - 1] = 0
                start -= 1
            start = start + 1 + quiet
            if end - start <= 11:
                continue
            activation = float(np.mean(frames[start:end, pitch_index]))
            events.append((start, end, int(pitch_index) + 21, activation))
        return sorted(events, key=lambda value: (value[0], value[2], value[1]))

    @classmethod
    def _frame_times(cls, frame_count: int, np: Any) -> Any:
        frames = np.arange(frame_count)
        original = frames * cls.FFT_HOP / cls.SAMPLE_RATE
        window_number = np.floor(frames / cls.ANNOTATION_FRAMES)
        offset = cls.FFT_HOP / cls.SAMPLE_RATE * (cls.ANNOTATION_FRAMES - cls.WINDOW_SAMPLES / cls.FFT_HOP) + 0.0018
        return original - offset * window_number
