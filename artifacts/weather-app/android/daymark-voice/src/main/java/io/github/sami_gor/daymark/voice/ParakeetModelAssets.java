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

    /**
     * Pinned SHA-256 digests of the model files, in the same order as
     * {@link #MODEL_FILE_NAMES}.
     *
     * <p>These are the digests published with the upstream release and pinned in
     * {@code android/kokoro-poc/scripts/fetch-parakeet-assets.sh}. A byte-length
     * check alone cannot detect same-length corruption, so the digests are the
     * authority for what may be loaded.
     */
    public static final String[] MODEL_FILE_SHA256 = {
        "acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247",
        "179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e",
        "3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3",
        "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d",
    };

    /**
     * Identifier of the pinned model content.
     *
     * <p>Bump this whenever a file, its size or its digest changes. A marker
     * written for a different identifier is treated as stale and the model is
     * re-hashed before it may be used.
     */
    public static final String MODEL_VERSION = "parakeet-tdt-0.6b-v3-int8-sha256-1";

    /** Directory inside the app's private files directory the model is materialised into. */
    public static final String MODEL_DIRECTORY = "parakeet-v3-model";

    /** Reason reported when the model is not present on the device. */
    public static final String REASON_MODEL_MISSING = "model-missing";

    /** Reason reported while the model is still being materialised. */
    public static final String REASON_MODEL_PREPARING = "model-preparing";

    /** Reason reported when materialised model content fails verification. */
    public static final String REASON_MODEL_CORRUPT = "model-corrupt";

    /** Reason reported when the runtime itself cannot be used. */
    public static final String REASON_RUNTIME_UNAVAILABLE = "runtime-unavailable";

    private ParakeetModelAssets() {
    }

    static {
        if (MODEL_FILE_NAMES.length != MODEL_FILE_SIZES.length
                || MODEL_FILE_NAMES.length != MODEL_FILE_SHA256.length) {
            throw new AssertionError("the Parakeet model name, size and digest tables must align");
        }
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
