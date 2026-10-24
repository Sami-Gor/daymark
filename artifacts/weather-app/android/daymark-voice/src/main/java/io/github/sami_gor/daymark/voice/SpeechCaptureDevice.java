package io.github.sami_gor.daymark.voice;

/**
 * The microphone capture device behind one recognition session.
 *
 * <p>Package-private seam: the plugin drives the capture lifecycle through
 * this interface so the lifecycle itself (creation races, cancellation,
 * bounded reads, teardown) can be unit-tested on the JVM with a fake device
 * instead of Android audio hardware. Production uses
 * {@link AudioSpeechCaptureDevice}.
 *
 * <p>Ownership contract: the caller that obtains a device from the supplier
 * owns it exclusively. It calls {@link #start()} once, then {@link #read} as
 * long as it wants audio, and {@link #release()} exactly once on every path
 * (including the paths where start fails or the session was cancelled while
 * the device was being created). No other thread releases a device while a
 * read may be in flight.
 */
interface SpeechCaptureDevice {

    /**
     * Constructs the recorder, checks it reached the initialized state,
     * starts recording and verifies the recorder actually reached the
     * recording state.
     *
     * @return true only when the microphone is actually recording; false when
     *         construction, the state check or the start failed
     * @throws SecurityException when the RECORD_AUDIO permission is no longer
     *                           held, so the caller can report it as a
     *                           permission failure rather than a capture fault
     */
    boolean start();

    /**
     * Reads up to {@code buffer.length} samples, waiting at most
     * {@code timeoutMs} for data to arrive. Bounded reads are what keep the
     * caller's capture deadline enforceable: a stalled input can never hold
     * the caller hostage, and a cancelled session is noticed promptly.
     *
     * @param buffer    destination for the samples
     * @param timeoutMs maximum time to wait for data, in milliseconds
     * @return the number of samples read (0 when the timeout expired with no
     *         data, possibly fewer than requested), or a negative value on an
     *         error or dead object
     */
    int read(short[] buffer, int timeoutMs);

    /** Whether the device believes it is recording right now. */
    boolean isRecording();

    /**
     * Stops recording and frees the device. Idempotent and thread-safe: the
     * first call frees the device, later calls do nothing.
     */
    void release();
}
