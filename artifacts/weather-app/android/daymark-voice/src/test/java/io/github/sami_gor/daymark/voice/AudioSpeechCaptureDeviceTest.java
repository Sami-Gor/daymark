package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertThrows;

import android.content.ContextWrapper;
import android.content.pm.PackageManager;

import org.junit.Test;

/** Guards the local RECORD_AUDIO check inside the real capture device. */
public class AudioSpeechCaptureDeviceTest {
    @Test
    public void startRefusesWhenRecordAudioPermissionIsMissing() {
        final ContextWrapper context = new ContextWrapper(null) {
            @Override
            public int checkSelfPermission(String permission) {
                return PackageManager.PERMISSION_DENIED;
            }
        };

        final AudioSpeechCaptureDevice device = new AudioSpeechCaptureDevice(context, 16_000);

        assertThrows(SecurityException.class, device::start);
    }
}
