package io.github.sami_gor.daymark;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.k2fsa.sherpa.onnx.FeatureConfig;
import com.k2fsa.sherpa.onnx.HomophoneReplacerConfig;
import com.k2fsa.sherpa.onnx.OfflineModelConfig;
import com.k2fsa.sherpa.onnx.OfflineRecognizer;
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig;
import com.k2fsa.sherpa.onnx.OfflineStream;
import com.k2fsa.sherpa.onnx.OfflineTransducerModelConfig;
import com.k2fsa.sherpa.onnx.QnnConfig;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.BufferedInputStream;
import java.io.BufferedWriter;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import io.github.sami_gor.daymark.voice.ParakeetModelAssets;
import io.github.sami_gor.daymark.voice.ParakeetModelIntegrity;

@RunWith(AndroidJUnit4.class)
public class ParakeetOrt132InferenceTest {
    private static final int SAMPLE_RATE = 16000;
    private static final int FEATURE_DIMENSION = 80;
    private static final int THREADS = 2;

    @Test
    public void decodeSetBWithProductionConfiguration() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File modelDir = new File(context.getFilesDir(), ParakeetModelAssets.MODEL_DIRECTORY);
        ParakeetModelIntegrity.Result integrity = ParakeetModelIntegrity.verify(
                modelDir,
                ParakeetModelAssets.MODEL_VERSION,
                ParakeetModelAssets.MODEL_FILE_NAMES,
                ParakeetModelAssets.MODEL_FILE_SIZES,
                ParakeetModelAssets.MODEL_FILE_SHA256);
        assertTrue("model integrity: " + integrity.status() + " " + integrity.reason(),
                integrity.isOk());

        File wavDir = new File(context.getFilesDir(), "wavs");
        File[] files = wavDir.listFiles((d, n) -> n.endsWith(".wav"));
        assertTrue("no prerecorded WAVs", files != null && files.length > 0);
        Arrays.sort(files);

        OfflineRecognizer recognizer = buildRecognizer(modelDir);
        List<String> lines = new ArrayList<>();
        try {
            for (File wav : files) {
                Wave wave = Wave.read(wav);
                assertEquals("channel count " + wav.getName(), 1, wave.channels);
                assertEquals("sample rate " + wav.getName(), SAMPLE_RATE, wave.sampleRate);
                assertEquals("bits per sample " + wav.getName(), 16, wave.bitsPerSample);
                OfflineStream stream = recognizer.createStream();
                try {
                    stream.acceptWaveform(wave.samples, SAMPLE_RATE);
                    recognizer.decode(stream);
                    String text = recognizer.getResult(stream).getText();
                    assertTrue("empty transcript for " + wav.getName(), text != null && !text.trim().isEmpty());
                    lines.add(wav.getName() + "\t" + sha256(wav) + "\t" + text);
                } finally {
                    stream.release();
                }
            }
        } finally {
            recognizer.release();
        }

        File out = new File(context.getFilesDir(), "parakeet-ort132-result.txt");
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(out, false))) {
            for (String line : lines) {
                writer.write(line);
                writer.newLine();
            }
        }
        assertTrue("decoded file count", lines.size() == files.length);
    }

    private static OfflineRecognizer buildRecognizer(File directory) {
        OfflineTransducerModelConfig transducer = new OfflineTransducerModelConfig(
                new File(directory, "encoder.int8.onnx").getAbsolutePath(),
                new File(directory, "decoder.int8.onnx").getAbsolutePath(),
                new File(directory, "joiner.int8.onnx").getAbsolutePath(),
                new QnnConfig());
        OfflineModelConfig model = new OfflineModelConfig();
        model.setTransducer(transducer);
        model.setTokens(new File(directory, "tokens.txt").getAbsolutePath());
        model.setNumThreads(THREADS);
        model.setProvider("cpu");
        model.setModelType("nemo_transducer");
        model.setModelingUnit("cjkchar");
        OfflineRecognizerConfig config = new OfflineRecognizerConfig();
        config.setFeatConfig(new FeatureConfig(SAMPLE_RATE, FEATURE_DIMENSION, 0.0f));
        config.setModelConfig(model);
        config.setHr(new HomophoneReplacerConfig("", "", ""));
        config.setDecodingMethod("greedy_search");
        config.setMaxActivePaths(4);
        config.setHotwordsFile("");
        config.setHotwordsScore(0.0f);
        config.setBlankPenalty(0.0f);
        return new OfflineRecognizer(null, config);
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (DataInputStream in = new DataInputStream(new BufferedInputStream(new FileInputStream(file)))) {
            byte[] buffer = new byte[65536];
            int read;
            while ((read = in.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        StringBuilder out = new StringBuilder();
        for (byte b : digest.digest()) out.append(String.format("%02x", b));
        return out.toString();
    }

    private static final class Wave {
        final int channels;
        final int sampleRate;
        final int bitsPerSample;
        final float[] samples;

        private Wave(int channels, int sampleRate, int bitsPerSample, float[] samples) {
            this.channels = channels;
            this.sampleRate = sampleRate;
            this.bitsPerSample = bitsPerSample;
            this.samples = samples;
        }

        static Wave read(File file) throws IOException {
            try (DataInputStream in = new DataInputStream(new BufferedInputStream(new FileInputStream(file)))) {
                if (!"RIFF".equals(readFourCC(in))) throw new IOException("not RIFF: " + file);
                readLE32(in);
                if (!"WAVE".equals(readFourCC(in))) throw new IOException("not WAVE: " + file);
                int channels = -1; int sampleRate = -1; int bits = -1; byte[] data = null;
                while (true) {
                    String id;
                    try { id = readFourCC(in); } catch (IOException eof) { break; }
                    int size = readLE32(in);
                    if ("fmt ".equals(id)) {
                        int format = readLE16(in);
                        channels = readLE16(in);
                        sampleRate = readLE32(in);
                        readLE32(in); readLE16(in); bits = readLE16(in);
                        if (format != 1) throw new IOException("not PCM: " + file);
                        int remaining = size - 16; while (remaining-- > 0) in.readByte();
                    } else if ("data".equals(id)) {
                        data = new byte[size]; in.readFully(data);
                    } else {
                        int remaining = size; while (remaining-- > 0) in.readByte();
                    }
                    if (size % 2 != 0) in.readByte();
                }
                if (channels < 0 || sampleRate < 0 || bits != 16 || data == null) throw new IOException("incomplete WAV: " + file);
                if (data.length % 2 != 0) throw new IOException("odd PCM data: " + file);
                float[] samples = new float[data.length / 2];
                for (int i = 0; i < samples.length; i++) {
                    int lo = data[i * 2] & 0xff; int hi = data[i * 2 + 1];
                    short value = (short) ((hi << 8) | lo);
                    samples[i] = value / 32768.0f;
                }
                return new Wave(channels, sampleRate, bits, samples);
            }
        }

        static String readFourCC(DataInputStream in) throws IOException {
            byte[] b = new byte[4]; in.readFully(b);
            return new String(b, StandardCharsets.US_ASCII);
        }
        static int readLE16(DataInputStream in) throws IOException {
            int b0 = in.readUnsignedByte(); int b1 = in.readUnsignedByte();
            return b0 | (b1 << 8);
        }
        static int readLE32(DataInputStream in) throws IOException {
            int b0 = in.readUnsignedByte(); int b1 = in.readUnsignedByte(); int b2 = in.readUnsignedByte(); int b3 = in.readUnsignedByte();
            return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
        }
    }
}