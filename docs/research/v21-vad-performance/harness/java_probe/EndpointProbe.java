package io.github.sami_gor.daymark.voice;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

/**
 * Differential probe: feeds a precomputed (rms, frameCount) stream to the real
 * production SpeechEndpointDetector and prints the block indices at which the
 * utterance starts and ends. The Python harness feeds the same stream to its
 * port and compares, so the port is validated against the Java class instead
 * of by inspection.
 *
 * Usage: java EndpointProbe <threshold> <sampleRate> <onsetMs> <hangoverMs> <csv>
 * CSV rows: "rms,frameCount"
 */
public final class EndpointProbe {
    public static void main(String[] args) throws Exception {
        float threshold = Float.parseFloat(args[0]);
        int sampleRate = Integer.parseInt(args[1]);
        int onsetMs = Integer.parseInt(args[2]);
        int hangoverMs = Integer.parseInt(args[3]);
        Path input = Paths.get(args[4]);
        SpeechEndpointDetector detector =
                new SpeechEndpointDetector(threshold, sampleRate, onsetMs, hangoverMs);
        List<String> lines = Files.readAllLines(input);
        int index = 0;
        int startedAt = -1;
        int finishedAt = -1;
        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty()) {
                continue;
            }
            String[] parts = line.split(",");
            float rms = Float.parseFloat(parts[0]);
            int frames = Integer.parseInt(parts[1]);
            boolean finished = detector.accept(rms, frames);
            if (startedAt < 0 && detector.hasSpeechStarted()) {
                startedAt = index;
            }
            if (finished) {
                finishedAt = index;
                break;
            }
            index++;
        }
        System.out.println(startedAt + " " + finishedAt + " " + (detector.hasSpeechStarted() ? 1 : 0));
    }
}
