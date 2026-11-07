package io.github.sami_gor.daymark.voice;

/**
 * Free-space decision for first-run model materialisation.
 *
 * <p>The four Parakeet files total ~670 MB. Installation copies one asset at a
 * time to a temporary file and renames it into place, so the destination needs
 * room for every installed byte plus one in-flight temporary copy. A margin is
 * added because the filesystem and the rest of the system keep consuming space
 * while the copy runs; checking only the compressed or nominal size is not
 * sufficient.
 */
public final class ModelStoragePreflight {

    /** Extra headroom: 3% of the model, at least 16 MiB. */
    public static final long MIN_MARGIN_BYTES = 16L * 1024L * 1024L;
    public static final long MARGIN_PERCENT = 3L;

    private ModelStoragePreflight() {
    }

    /** Bytes required to install {@code sizes} into an empty directory. */
    public static long requiredBytes(long[] sizes) {
        if (sizes == null || sizes.length == 0) {
            return 0L;
        }
        long total = 0L;
        long largest = 0L;
        for (long size : sizes) {
            if (size < 0) {
                throw new IllegalArgumentException("negative-size");
            }
            total += size;
            largest = Math.max(largest, size);
        }
        long margin = Math.max(MIN_MARGIN_BYTES, total * MARGIN_PERCENT / 100L);
        return total + largest + margin;
    }

    /** True when {@code availableBytes} covers the installation. */
    public static boolean hasRoom(long availableBytes, long[] sizes) {
        return availableBytes >= requiredBytes(sizes);
    }
}
