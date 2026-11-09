package io.github.sami_gor.daymark.packs;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Application-facing orchestration for one optional narration voice.
 *
 * <p>This class is deliberately free of Android and Capacitor types so the real
 * download → verify → install → activate → register sequence can be exercised on
 * a plain JVM with a fixture transport and registrar. The plugin only adapts
 * {@link #start(String, String, Completion)} to a bridge call and forwards
 * {@link Progress} to a Capacitor event.
 *
 * <p>Guarantees:
 * <ul>
 *   <li>Only one install can run at a time ({@code install-in-progress}).</li>
 *   <li>Every progress event carries the operation id that owns it. Progress
 *       from a cancelled, superseded or finished operation is dropped, so a
 *       late transport callback can never overwrite a newer operation.</li>
 *   <li>Identical progress snapshots are emitted once; the UI is never asked to
 *       render the same byte count twice.</li>
 *   <li>READY is reported only when {@link VoiceRegistrationFlow} reports the
 *       runtime's loaded set contains the voice. Downloading and installing a
 *       file is not readiness.</li>
 * </ul>
 */
public final class VoicePackManager {

    /** Extra time allowed for the native engine to reload its voice set. */
    private static final long REGISTRATION_TIMEOUT_SECONDS = 90L;

    /** Runs install work off the caller's thread; tests inject a direct executor. */
    public interface Executor {
        void execute(Runnable command);
    }

    /** Receives one progress snapshot. May be called on the executor thread. */
    public interface ProgressSink {
        void onProgress(Progress progress);
    }

    /** Completion for an operation that actually started. */
    public interface Completion {
        void onFinished(Outcome outcome);
    }

    public enum Phase {
        DOWNLOADING,
        VERIFYING,
        INSTALLING,
        ACTIVATING,
        REGISTERING,
        READY,
        FAILED;

        public String wireName() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    /** Immutable progress snapshot; {@code percentage} is -1 when unknown. */
    public static final class Progress {
        public final String voiceId;
        public final String operationId;
        public final Phase phase;
        public final long bytesReceived;
        public final long totalBytes;
        /** 0–100, or -1 when the total is not known. */
        public final double percentage;
        /** Stable error code for {@link Phase#FAILED}, otherwise empty. */
        public final String errorCode;

        Progress(
                String voiceId,
                String operationId,
                Phase phase,
                long bytesReceived,
                long totalBytes,
                String errorCode) {
            this.voiceId = voiceId;
            this.operationId = operationId;
            this.phase = phase;
            this.bytesReceived = Math.max(0L, bytesReceived);
            this.totalBytes = Math.max(0L, totalBytes);
            this.errorCode = errorCode == null ? "" : errorCode;
            this.percentage = this.totalBytes <= 0
                    ? -1d
                    : Math.min(100d, (this.bytesReceived * 100d) / this.totalBytes);
        }
    }

    /** Immutable completion result. */
    public static final class Outcome {
        public final boolean ready;
        public final String errorCode;
        public final Map<String, String> states;

        Outcome(boolean ready, String errorCode, Map<String, String> states) {
            this.ready = ready;
            this.errorCode = errorCode == null ? "" : errorCode;
            this.states = Collections.unmodifiableMap(new LinkedHashMap<>(states));
        }
    }

    /** Local (no network) description of one allowed optional voice. */
    public static final class Info {
        public final String voiceId;
        public final String packId;
        public final String language;
        public final long sizeBytes;
        public final long installedVersion;
        public final boolean installed;
        public final boolean ready;
        public final String state;
        public final String licenceSpdx;
        public final String licenceName;
        public final String licenceUrl;
        public final String licenceAttribution;
        public final String licenceNotice;

        Info(
                String voiceId,
                String packId,
                String language,
                long sizeBytes,
                long installedVersion,
                boolean installed,
                boolean ready,
                String state,
                String licenceSpdx,
                String licenceName,
                String licenceUrl,
                String licenceAttribution,
                String licenceNotice) {
            this.voiceId = voiceId;
            this.packId = packId;
            this.language = language;
            this.sizeBytes = sizeBytes;
            this.installedVersion = installedVersion;
            this.installed = installed;
            this.ready = ready;
            this.state = state;
            this.licenceSpdx = licenceSpdx;
            this.licenceName = licenceName;
            this.licenceUrl = licenceUrl;
            this.licenceAttribution = licenceAttribution;
            this.licenceNotice = licenceNotice;
        }
    }

    private final PackSourceConfig source;
    private final PackInstaller installer;
    private final File voicesDir;
    private final PackDownloader downloader;
    private final VoiceRegistrationFlow registration;
    private final Executor executor;
    private final ProgressSink progressSink;
    private final Object lock = new Object();

    private Active active;

    public VoicePackManager(
            PackSourceConfig source,
            PackInstaller installer,
            File voicesDir,
            PackDownloader downloader,
            VoiceRegistrationFlow registration,
            Executor executor,
            ProgressSink progressSink) {
        if (source == null || installer == null || voicesDir == null
                || downloader == null || registration == null || executor == null) {
            throw new IllegalArgumentException(
                    "source, installer, voicesDir, downloader, registration and executor are required");
        }
        this.source = source;
        this.installer = installer;
        this.voicesDir = voicesDir;
        this.downloader = downloader;
        this.registration = registration;
        this.executor = executor;
        this.progressSink = progressSink;
    }

    /** Allowed optional voices in configuration order. */
    public List<Info> infos() {
        List<Info> infos = new ArrayList<>();
        for (PackSourceConfig.VoiceSource voice : source.voices()) {
            infos.add(info(voice.voiceId()));
        }
        return infos;
    }

    /** Local description used by {@code getVoicePackInfo()}; never touches the network. */
    public Info info(String voiceId) {
        PackSourceConfig.VoiceSource voice = source.requireVoice(voiceId);
        long version = installer.activeVersion(voice.packId());
        File voiceFile = new File(voicesDir, voiceId + ".bin");
        boolean installed = version > 0 && voiceFile.isFile();
        boolean ready = registration.isReady(voiceId);
        String state = registration.states().get(voiceId);
        if (state == null || state.isEmpty()) {
            state = ready ? "ready" : "available";
        }
        String[] licence = licenceFor(voiceId);
        return new Info(
                voiceId,
                voice.packId(),
                voice.language(),
                voice.sizeBytes(),
                version,
                installed,
                ready,
                state,
                licence[0],
                licence[1],
                licence[2],
                licence[3],
                licence[4]);
    }

    /** Authoritative per-voice lifecycle states (delegates to the registration flow). */
    public Map<String, String> states() {
        return registration.states();
    }

    /** True when an install owns the single install slot. */
    public boolean isInstalling() {
        synchronized (lock) {
            return active != null;
        }
    }

    /**
     * Starts one install. Returns {@code null} when the operation started, or a
     * stable error code when it was rejected before any work began:
     * {@code unsupported-voice}, {@code invalid-operation} or
     * {@code install-in-progress}. {@code completion} is called exactly once for
     * operations that start.
     */
    public String start(final String voiceId, final String operationId, final Completion completion) {
        if (completion == null) {
            throw new IllegalArgumentException("completion is required");
        }
        if (!source.allows(voiceId)) {
            return "unsupported-voice";
        }
        if (!isValidOperationId(operationId)) {
            return "invalid-operation";
        }
        final Active operation = new Active(voiceId, operationId, completion);
        synchronized (lock) {
            if (active != null) {
                return "install-in-progress";
            }
            active = operation;
        }
        try {
            executor.execute(new Runnable() {
                @Override
                public void run() {
                    runInstall(operation);
                }
            });
        } catch (RuntimeException rejectedExecution) {
            finish(operation, false, "pack-install-failed");
        }
        return null;
    }

    /**
     * Cooperative cancellation. Returns false when the operation is not the
     * active one (already finished, superseded, or never started).
     */
    public boolean cancel(String operationId) {
        Active operation;
        synchronized (lock) {
            operation = active;
            if (operation == null || operationId == null
                    || !operation.operationId.equals(operationId)) {
                return false;
            }
            operation.cancelled = true;
        }
        finish(operation, false, "cancelled");
        return true;
    }

    private void runInstall(Active operation) {
        long total = 0L;
        try {
            emit(operation, Phase.VERIFYING, 0L, 0L, "");
            checkCancelled(operation);
            PackDownloader.FetchedManifest fetched = downloader.fetchVerifiedManifest(
                    source.manifestUrl(operation.voiceId),
                    source.signatureUrl(operation.voiceId));
            checkCancelled(operation);
            PackManifest manifest = fetched.manifest;
            PackSourceConfig.VoiceSource voice = source.requireVoice(operation.voiceId);
            if (!operation.voiceId.equals(manifest.voiceId())
                    || !voice.packId().equals(manifest.packId())) {
                throw new PackInstaller.PackException("pack-mismatch",
                        "signed manifest does not describe the requested voice");
            }
            total = manifest.file().size();
            operation.totalBytes = total;
            emit(operation, Phase.DOWNLOADING, 0L, total, "");
            final long expectedTotal = total;
            downloader.install(
                    manifest,
                    source.payloadUrl(operation.voiceId),
                    fetched.signature(),
                    new PackTransport.Progress() {
                        @Override
                        public void onProgress(long downloadedBytes, long totalBytes) {
                            emit(operation, Phase.DOWNLOADING, downloadedBytes,
                                    totalBytes > 0 ? totalBytes : expectedTotal, "");
                        }
                    },
                    new PackTransport.CancelSignal() {
                        @Override
                        public boolean isCancelled() {
                            return operation.cancelled || !isActive(operation);
                        }
                    },
                    new PackDownloader.StageObserver() {
                        @Override
                        public void onStage(PackDownloader.Stage stage) {
                            if (stage == PackDownloader.Stage.VERIFYING) {
                                // The manifest was already authenticated before
                                // the payload download; do not rewind the phase.
                                return;
                            }
                            if (stage == PackDownloader.Stage.DOWNLOADING) {
                                // The transport reports real bytes; this stage
                                // callback only announces that download began.
                                emit(operation, Phase.DOWNLOADING, 0L,
                                        operation.totalBytes, "");
                            } else {
                                emit(operation, stageFor(stage),
                                        operation.totalBytes, operation.totalBytes, "");
                            }
                        }
                    });
            checkCancelled(operation);
            registration.installVerified(operation.voiceId);
            emit(operation, Phase.REGISTERING, total, total, "");
            String registrationError = awaitRegistration(operation);
            if (operation.cancelled) {
                finish(operation, false, "cancelled");
                return;
            }
            if (registrationError != null) {
                finish(operation, false, registrationError);
                return;
            }
            finish(operation, true, "");
        } catch (PackInstaller.PackException failure) {
            finish(operation, false, operation.cancelled ? "cancelled" : failure.reason);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            finish(operation, false, "cancelled");
        } catch (RuntimeException failure) {
            // Configuration drift or an unexpected runtime fault must still give
            // the caller a terminal result; never leave the UI spinning.
            finish(operation, false, operation.cancelled ? "cancelled" : "pack-install-failed");
        }
    }

    /** @return null when the runtime loaded the voice, otherwise a stable code. */
    private String awaitRegistration(Active operation) throws InterruptedException {
        final CountDownLatch finished = new CountDownLatch(1);
        final boolean[] ready = {false};
        final String[] error = {""};
        registration.activate(operation.voiceId, new VoiceRegistrationFlow.Result() {
            @Override
            public void onResult(boolean registered, String reason, Map<String, String> states) {
                ready[0] = registered;
                error[0] = reason == null ? "" : reason;
                finished.countDown();
            }
        });
        final long deadlineNanos = System.nanoTime()
                + TimeUnit.SECONDS.toNanos(REGISTRATION_TIMEOUT_SECONDS);
        while (!finished.await(100L, TimeUnit.MILLISECONDS)) {
            // A cancel must release the single install slot promptly even if
            // the native engine never calls back.
            if (operation.cancelled) {
                return "cancelled";
            }
            if (System.nanoTime() >= deadlineNanos) {
                return "registration-timeout";
            }
        }
        if (ready[0]) {
            return null;
        }
        return error[0].isEmpty() ? "registration-failed" : error[0];
    }

    private void finish(Active operation, boolean ready, String errorCode) {
        synchronized (lock) {
            if (operation.completed) {
                return;
            }
            operation.completed = true;
            if (active == operation) {
                active = null;
            }
        }
        String error = errorCode == null ? "" : errorCode;
        if (ready) {
            emit(operation, Phase.READY, operation.totalBytes, operation.totalBytes, "");
        } else {
            emit(operation, Phase.FAILED, operation.totalBytes, operation.totalBytes, error);
        }
        operation.completion.onFinished(new Outcome(ready, error, registration.states()));
    }

    private void emit(Active operation, Phase phase, long bytesReceived, long totalBytes,
            String errorCode) {
        String error = errorCode == null ? "" : errorCode;
        Progress snapshot = new Progress(
                operation.voiceId, operation.operationId, phase, bytesReceived, totalBytes, error);
        synchronized (lock) {
            if (operation.completed && phase != Phase.READY && phase != Phase.FAILED) {
                return;
            }
            String key = phase.name() + "|" + snapshot.bytesReceived + "|"
                    + snapshot.totalBytes + "|" + error;
            if (key.equals(operation.lastProgressKey)) {
                return;
            }
            operation.lastProgressKey = key;
            if (!error.isEmpty() || phase == Phase.FAILED) {
                operation.errorCode = error;
            }
        }
        ProgressSink sink = progressSink;
        if (sink != null) {
            sink.onProgress(snapshot);
        }
    }

    private boolean isActive(Active operation) {
        synchronized (lock) {
            return active == operation && !operation.completed;
        }
    }

    private void checkCancelled(Active operation) throws PackInstaller.PackException {
        if (operation.cancelled || !isActive(operation)) {
            throw new PackInstaller.PackException("cancelled", "pack install was cancelled");
        }
    }

    private static Phase stageFor(PackDownloader.Stage stage) {
        switch (stage) {
            case DOWNLOADING:
                return Phase.DOWNLOADING;
            case INSTALLING:
                return Phase.INSTALLING;
            case ACTIVATING:
                return Phase.ACTIVATING;
            case VERIFYING:
            default:
                return Phase.VERIFYING;
        }
    }

    private static String[] licenceFor(String voiceId) {
        if (PackLicences.FRENCH_VOICE.equals(voiceId)) {
            return new String[]{
                    PackLicences.FRENCH_LICENCE_SPDX,
                    PackLicences.FRENCH_LICENCE_NAME,
                    PackLicences.FRENCH_LICENCE_URL,
                    PackLicences.FRENCH_ATTRIBUTION,
                    PackLicences.FRENCH_NOTICE};
        }
        return new String[]{
                PackLicences.SPANISH_LICENCE_SPDX,
                PackLicences.SPANISH_LICENCE_NAME,
                PackLicences.SPANISH_LICENCE_URL,
                PackLicences.SPANISH_ATTRIBUTION,
                PackLicences.SPANISH_NOTICE};
    }

    private static boolean isValidOperationId(String operationId) {
        return operationId != null && operationId.matches("[A-Za-z0-9._:-]{1,120}");
    }

    private static final class Active {
        final String voiceId;
        final String operationId;
        final Completion completion;
        volatile boolean cancelled;
        boolean completed;
        String lastProgressKey = "";
        long totalBytes;
        String errorCode = "";

        Active(String voiceId, String operationId, Completion completion) {
            this.voiceId = voiceId;
            this.operationId = operationId;
            this.completion = completion;
        }
    }
}
