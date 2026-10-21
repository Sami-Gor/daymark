package io.github.sami_gor.daymark.voice;

/**
 * The Parakeet TDT 0.6B v3 int8 model files and where they live on the device.
 *
 * <p>The model is delivered as Android assets and materialised into the app's
 * private files directory on first use. ONNX Runtime needs a real file path, and
 * memory-maps it, which keeps the resident footprint of a 640 MB model far below
 * what loading it into the Java heap would cost.
 *
 * <p>The paths and names are kept here, free of Android types, so they can be
 * covered by plain JVM unit tests.
 */
public final class ParakeetModelAssets {

    /** Asset directory the model files are packaged under. */
    public static final String ASSET_DIRECTORY = "parakeet";

    /** The four files that make up the model, in load order. */
    public static final String[] MODEL_FILE_NAMES = {
        "encoder.int8.onnx",
        "decoder.int8.onnx",
        "joiner.int8.onnx",
        "tokens.txt",
    };

    /** Exact byte lengths; a truncated or partial copy must be treated as corrupt. */
    public static final long[] MODEL_FILE_SIZES = {
        652184281L,
        11845275L,
        6355277L,
        93939L,
    };

    /** Directory inside the app's private files directory the model is materialised into. */
    public static final String MODEL_DIRECTORY = "parakeet-v3-model";

    /** Reason reported when the model is not present on the device. */
    public static final String REASON_MODEL_MISSING = "model-missing";

    /** Reason reported while the model is still being materialised. */
    public static final String REASON_MODEL_PREPARING = "model-preparing";

    /** Reason reported when the runtime itself cannot be used. */
    public static final String REASON_RUNTIME_UNAVAILABLE = "runtime-unavailable";

    private ParakeetModelAssets() {
    }

    /** Asset path of a model file, for example {@code parakeet/encoder.int8.onnx}. */
    public static String assetPath(String fileName) {
        return ASSET_DIRECTORY + "/" + fileName;
    }

    /** File name of the model inside the materialised model directory. */
    public static String fileName(String fileName) {
        return MODEL_DIRECTORY + "/" + fileName;
    }

    /** Whether the name is one of the model's files. */
    public static boolean isModelFile(String fileName) {
        for (String candidate : MODEL_FILE_NAMES) {
            if (candidate.equals(fileName)) {
                return true;
            }
        }
        return false;
    }
}
