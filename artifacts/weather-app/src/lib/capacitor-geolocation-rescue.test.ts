import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guard for the Capacitor geolocation coarse-only rescue patch.
 *
 * Daymark's Android manifest declares only ACCESS_COARSE_LOCATION. Capacitor's
 * `BridgeWebChromeClient.onGeolocationPermissionsShowPrompt` requests
 * `{COARSE, FINE}` and treats the result as granted only when *all* requested
 * permissions are granted. Because FINE is not declared it is always
 * auto-denied, so the AND-callback reports failure. Upstream rescues a
 * coarse-only grant — but only on API >= 31 (`Build.VERSION.SDK_INT >= S`),
 * which denied WebView geolocation outright on API 24–30 even with coarse
 * granted (reproduced on an API 30 emulator: geolocation error code 1 with
 * `ACCESS_COARSE_LOCATION` granted; `pm grant ACCESS_FINE_LOCATION` throws
 * because the permission is undeclared).
 *
 * The repo therefore carries a pnpm patch that removes the API gate, so the
 * coarse-only rescue applies on every supported API level. These checks pin:
 *   1. the shipped patch file removes exactly that gate,
 *   2. pnpm-workspace.yaml wires the patch into installs,
 *   3. the installed @capacitor/android copy carries the ungated rescue,
 *   4. the Android build compiles the *patched* store copy — the generated
 *      `capacitor.settings.gradle` must reference the `patch_hash=` store
 *      directory and that directory must exist (a stale settings file would
 *      silently compile unpatched Capacitor),
 *   5. pnpm-lock.yaml routes @capacitor/android to the patched snapshot and
 *      the app-level symlink resolves into the same store directory,
 *   6. BEHAVIOUR: a JVM harness compiles the real patched store classes
 *      (BridgeWebChromeClient + PermissionHelper) against minimal framework
 *      stubs and exercises the full decision table — all granted → allow,
 *      coarse-only granted → allow (the new behaviour, at API 24/30/31),
 *      coarse denied → deny, nothing granted → deny — with no device,
 *      Robolectric or Gradle required. A negative control compiles the
 *      unpatched upstream twin from the same store and asserts the gate
 *      denies coarse-only grants on API <= 30, proving the harness would
 *      catch an unpatched dependency.
 */
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const patchFile = path.join(repoRoot, 'patches', '@capacitor__android@8.5.1.patch');
const workspaceFile = path.join(repoRoot, 'pnpm-workspace.yaml');
const bridgeClientFile = path.join(
  appRoot,
  'node_modules',
  '@capacitor',
  'android',
  'capacitor',
  'src',
  'main',
  'java',
  'com',
  'getcapacitor',
  'BridgeWebChromeClient.java',
);
const settingsGradleFile = path.join(appRoot, 'android', 'capacitor.settings.gradle');

function geolocationPromptBody(source: string): string {
  const start = source.indexOf('onGeolocationPermissionsShowPrompt');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('onShowFileChooser', start);
  return source.slice(start, end > start ? end : undefined);
}

describe('capacitor geolocation coarse-only rescue', () => {
  it('ships a pnpm patch that removes the API-31-only gate', () => {
    expect(existsSync(patchFile)).toBe(true);
    const patch = readFileSync(patchFile, 'utf8');
    // The patch must delete the SDK_INT gate from the geolocation prompt...
    expect(patch).toContain('-                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&');
    // ...and replace the guarded block with the unconditional coarse rescue.
    expect(patch).toContain('+                    if (PermissionHelper.hasPermissions(bridge.getContext(), coarsePermission)) {');
  });

  it('wires the patch into pnpm installs via patchedDependencies', () => {
    const workspace = readFileSync(workspaceFile, 'utf8');
    expect(workspace).toMatch(/patchedDependencies:/);
    expect(workspace).toContain(`'@capacitor/android@8.5.1': patches/@capacitor__android@8.5.1.patch`);
  });

  it('installed @capacitor/android rescues coarse-only grants on every API level', () => {
    expect(existsSync(bridgeClientFile)).toBe(true);
    const installed = readFileSync(bridgeClientFile, 'utf8');
    const body = geolocationPromptBody(installed);
    expect(body).toContain('PermissionHelper.hasPermissions(bridge.getContext(), coarsePermission)');
    expect(body).not.toContain('Build.VERSION.SDK_INT >= Build.VERSION_CODES.S');
  });

  it('the Android build compiles the patched Capacitor copy', () => {
    const settings = readFileSync(settingsGradleFile, 'utf8');
    const match = settings.match(/project\(':capacitor-android'\)\.projectDir = new File\('([^']+)'\)/);
    expect(match).not.toBeNull();
    const relative = match![1];
    // The generated reference must point at the pnpm *patched* store entry.
    expect(relative).toMatch(/@capacitor\+android@[^/]*patch_hash=[0-9a-f]+_/);
    const projectDir = path.resolve(appRoot, 'android', relative);
    expect(existsSync(projectDir)).toBe(true);
  });

  it('resolves the patched store directory the build actually compiles', () => {
    const settings = readFileSync(settingsGradleFile, 'utf8');
    const match = settings.match(/project\(':capacitor-android'\)\.projectDir = new File\('([^']+)'\)/);
    expect(match).not.toBeNull();
    const projectDir = path.resolve(appRoot, 'android', match![1]);
    // .../node_modules/.pnpm/@capacitor+android@8.5.1_patch_hash=..._.../node_modules/@capacitor/android/capacitor
    const javaRoot = path.join(projectDir, 'src', 'main', 'java');
    expect(existsSync(javaRoot)).toBe(true);
    const patchedBridgeClient = path.join(javaRoot, 'com', 'getcapacitor', 'BridgeWebChromeClient.java');
    expect(existsSync(patchedBridgeClient), `${patchedBridgeClient} must exist`).toBe(true);
    const body = geolocationPromptBody(readFileSync(patchedBridgeClient, 'utf8'));
    expect(body).toContain('PermissionHelper.hasPermissions(bridge.getContext(), coarsePermission)');
    expect(body).not.toContain('Build.VERSION.SDK_INT >= Build.VERSION_CODES.S');
  });

  it('pnpm-lock.yaml routes the dependency to the same patched snapshot', () => {
    const lock = readFileSync(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
    // The lock records the patch hash under patchedDependencies…
    const patched = lock.match(/^  '@capacitor\/android@8\.5\.1': ([0-9a-f]+)$/m);
    expect(patched).not.toBeNull();
    const lockHash = patched![1];
    // …and resolves the workspace dependency to the patched snapshot.
    expect(lock).toContain(`version: 8.5.1(patch_hash=${lockHash})(@capacitor/core@8.5.1)`);
    // The store directory name carries a prefix of that exact hash…
    const settings = readFileSync(settingsGradleFile, 'utf8');
    const projectDir = path.resolve(
      appRoot,
      'android',
      settings.match(/project\(':capacitor-android'\)\.projectDir = new File\('([^']+)'\)/)![1],
    );
    // .../<store-entry>/node_modules/@capacitor/android/capacitor -> <store-entry>
    const storeEntry = path.basename(path.dirname(path.dirname(path.dirname(path.dirname(projectDir)))));
    const dirHash = storeEntry.match(/patch_hash=([0-9a-f]+)_/);
    expect(dirHash).not.toBeNull();
    expect(lockHash.startsWith(dirHash![1]), 'store dir hash must come from the lockfile patch hash').toBe(true);
  });

  it("the app-level node_modules symlink resolves into the patched store entry", () => {
    const link = readlinkSync(path.join(appRoot, 'node_modules', '@capacitor', 'android'));
    expect(link).toMatch(/@capacitor\+android@8\.5\.1_patch_hash=[0-9a-f]+_/);
    const resolved = realpathSync(path.join(appRoot, 'node_modules', '@capacitor', 'android'));
    // Same store entry the Gradle build compiles (via capacitor.settings.gradle).
    const settings = readFileSync(settingsGradleFile, 'utf8');
    const projectDir = path.resolve(
      appRoot,
      'android',
      settings.match(/project\(':capacitor-android'\)\.projectDir = new File\('([^']+)'\)/)![1],
    );
    expect(resolved).toBe(realpathSync(path.resolve(projectDir, '..')));
  });
});

/* ============================================================================
 * Behavioural harness: compile the REAL patched store classes on the JVM and
 * exercise the geolocation decision table.
 *
 * No Gradle, no Robolectric, no device: the decision logic under test is pure
 * Java (`BridgeWebChromeClient.onGeolocationPermissionsShowPrompt` plus the
 * constructor's AND-aggregation and `PermissionHelper.hasPermissions`), and the
 * only Android touchpoints are framework seams that minimal stubs reproduce:
 *   - ActivityCompat.checkSelfPermission — the OS permission state,
 *   - ActivityResultLauncher.launch — the OS request/deliver cycle.
 * The stubs record everything they see, so the assertions below run against
 * observed behaviour, not source text. When no JDK is available the harness
 * describe is skipped; the structural guards above still run everywhere.
 * ==========================================================================*/

/** The patched store Gradle projectDir, read from capacitor.settings.gradle. */
function patchedGradleProjectDir(): string {
  const settings = readFileSync(settingsGradleFile, 'utf8');
  const match = settings.match(/project\(':capacitor-android'\)\.projectDir = new File\('([^']+)'\)/);
  if (!match) {
    throw new Error(`capacitor.settings.gradle does not wire the capacitor-android project: ${settingsGradleFile}`);
  }
  return path.resolve(appRoot, 'android', match[1]);
}

const unpatchedJavaRoot = path.join(
  repoRoot, 'node_modules', '.pnpm', '@capacitor+android@8.5.1_@capacitor+core@8.5.1',
  'node_modules', '@capacitor', 'android', 'capacitor', 'src', 'main', 'java',
);

const HARNESS_STUBS: Record<string, string> = {
  'android/Manifest.java': `package android;

/** Harness stub: constants carry the real AOSP values and are inlined at compile time. */
public class Manifest {
    public static final class permission {
        public static final String ACCESS_COARSE_LOCATION = "android.permission.ACCESS_COARSE_LOCATION";
        public static final String ACCESS_FINE_LOCATION = "android.permission.ACCESS_FINE_LOCATION";
        public static final String CAMERA = "android.permission.CAMERA";
        public static final String MODIFY_AUDIO_SETTINGS = "android.permission.MODIFY_AUDIO_SETTINGS";
        public static final String RECORD_AUDIO = "android.permission.RECORD_AUDIO";
        public static final String INTERNET = "android.permission.INTERNET";

        private permission() {}
    }

    private Manifest() {}
}
`,
  'android/annotation/SuppressLint.java': `package android.annotation;

/** Harness stub. */
public @interface SuppressLint {
    String value();
}
`,
  'android/app/Activity.java': `package android.app;

import android.content.Context;

import java.io.File;

/** Harness stub. */
public class Activity extends Context {
    public static final int RESULT_OK = -1;

    public boolean isFinishing() {
        return false;
    }

    public File getExternalFilesDir(String type) {
        return null;
    }
}
`,
  'android/app/AlertDialog.java': `package android.app;

import android.content.Context;
import android.content.DialogInterface;
import android.view.View;

/** Harness stub. */
public class AlertDialog implements DialogInterface {
    @Override
    public void dismiss() {}

    public void show() {}

    public static class Builder {
        public Builder(Context context) {}

        public Builder setTitle(String title) {
            return this;
        }

        public Builder setMessage(String message) {
            return this;
        }

        public Builder setView(View view) {
            return this;
        }

        public Builder setPositiveButton(String text, DialogInterface.OnClickListener listener) {
            return this;
        }

        public Builder setNegativeButton(String text, DialogInterface.OnClickListener listener) {
            return this;
        }

        public Builder setOnCancelListener(DialogInterface.OnCancelListener listener) {
            return this;
        }

        public AlertDialog create() {
            return new AlertDialog();
        }
    }
}
`,
  'android/content/ActivityNotFoundException.java': `package android.content;

/** Harness stub. */
public class ActivityNotFoundException extends RuntimeException {
    public ActivityNotFoundException() {}

    public ActivityNotFoundException(String name) {
        super(name);
    }
}
`,
  'android/content/ClipData.java': `package android.content;

/** Harness stub. */
public class ClipData {
    public int getItemCount() {
        return 0;
    }

    public Item getItemAt(int index) {
        return null;
    }

    public static class Item {
        public android.net.Uri getUri() {
            return null;
        }
    }
}
`,
  'android/content/Context.java': `package android.content;

import android.content.pm.PackageManager;

/** Harness stub: only the members the compiled Capacitor classes touch. */
public class Context {
    public PackageManager getPackageManager() {
        return new PackageManager();
    }

    public String getPackageName() {
        return "io.github.sami_gor.daymark";
    }
}
`,
  'android/content/DialogInterface.java': `package android.content;

/** Harness stub. */
public interface DialogInterface {
    void dismiss();

    @FunctionalInterface
    interface OnClickListener {
        void onClick(DialogInterface dialog, int which);
    }

    @FunctionalInterface
    interface OnCancelListener {
        void onCancel(DialogInterface dialog);
    }
}
`,
  'android/content/Intent.java': `package android.content;

import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;

/** Harness stub: members used by BridgeWebChromeClient. */
public class Intent {
    public static final int FLAG_GRANT_READ_URI_PERMISSION = 1;
    public static final int FLAG_GRANT_WRITE_URI_PERMISSION = 2;
    public static final String EXTRA_ALLOW_MULTIPLE = "android.intent.extra.ALLOW_MULTIPLE";
    public static final String EXTRA_MIME_TYPES = "android.intent.extra.MIME_TYPES";

    public Intent() {}

    public Intent(String action) {}

    public Intent putExtra(String name, Uri value) {
        return this;
    }

    public Intent putExtra(String name, boolean value) {
        return this;
    }

    public Intent putExtra(String name, String[] value) {
        return this;
    }

    public Intent addFlags(int flags) {
        return this;
    }

    public String getType() {
        return null;
    }

    public Intent setType(String type) {
        return this;
    }

    public Uri getData() {
        return null;
    }

    public ClipData getClipData() {
        return null;
    }

    public ResolveInfo resolveActivity(PackageManager pm) {
        return null;
    }
}
`,
  'android/content/pm/PackageInfo.java': `package android.content.pm;

/** Harness stub. */
public class PackageInfo {
    public String[] requestedPermissions;
}
`,
  'android/content/pm/PackageManager.java': `package android.content.pm;

/** Harness stub. */
public class PackageManager {
    public static final int PERMISSION_GRANTED = 0;
    public static final int PERMISSION_DENIED = -1;
    public static final int GET_PERMISSIONS = 1;

    public PackageInfo getPackageInfo(String packageName, int flags) throws NameNotFoundException {
        throw new NameNotFoundException();
    }

    public PackageInfo getPackageInfo(String packageName, PackageInfoFlags flags) throws NameNotFoundException {
        throw new NameNotFoundException();
    }

    public static class PackageInfoFlags {
        public static PackageInfoFlags of(long flags) {
            return new PackageInfoFlags();
        }
    }

    public static class NameNotFoundException extends Exception {}
}
`,
  'android/content/pm/ResolveInfo.java': `package android.content.pm;

/** Harness stub. */
public class ResolveInfo {}
`,
  'android/net/Uri.java': `package android.net;

/** Harness stub: used as an opaque value type on the exercised paths. */
public class Uri {}
`,
  'android/os/Build.java': `package android.os;

/**
 * Harness stub. SDK_INT is deliberately NOT final so the probe can vary the
 * emulated API level at runtime; nothing inlines it and the geolocation
 * decision code under test reads it dynamically (in the unpatched copy).
 */
public class Build {
    public static class VERSION {
        public static int SDK_INT = 30;
    }

    public static class VERSION_CODES {
        public static final int S = 31;
        public static final int TIRAMISU = 33;
    }
}
`,
  'android/os/Environment.java': `package android.os;

/** Harness stub. */
public class Environment {
    public static final String DIRECTORY_PICTURES = "Pictures";
}
`,
  'android/provider/MediaStore.java': `package android.provider;

/** Harness stub. */
public class MediaStore {
    public static final String ACTION_IMAGE_CAPTURE = "android.media.action.IMAGE_CAPTURE";
    public static final String ACTION_VIDEO_CAPTURE = "android.media.action.VIDEO_CAPTURE";
    public static final String EXTRA_OUTPUT = "output";
}
`,
  'android/view/View.java': `package android.view;

import android.content.Context;

/** Harness stub. */
public class View {
    public View() {}

    public View(Context context) {}

    public Context getContext() {
        return null;
    }
}
`,
  'android/webkit/ConsoleMessage.java': `package android.webkit;

/** Harness stub. */
public class ConsoleMessage {
    public String message() {
        return null;
    }

    public int lineNumber() {
        return 0;
    }

    public String sourceId() {
        return null;
    }

    public MessageLevel messageLevel() {
        return MessageLevel.DEBUG;
    }

    public enum MessageLevel {
        DEBUG,
        ERROR,
        INFO,
        LOG,
        TIP,
        WARNING,
    }
}
`,
  'android/webkit/GeolocationPermissions.java': `package android.webkit;

/** Harness stub: the exact framework shape the rescue logic drives. */
public class GeolocationPermissions {
    public interface Callback {
        void invoke(String origin, boolean allow, boolean retain);
    }
}
`,
  'android/webkit/JsPromptResult.java': `package android.webkit;

/** Harness stub. */
public class JsPromptResult extends JsResult {
    public boolean confirm(String value) {
        return true;
    }
}
`,
  'android/webkit/JsResult.java': `package android.webkit;

/** Harness stub. */
public class JsResult {
    public boolean confirm() {
        return true;
    }

    public boolean cancel() {
        return true;
    }
}
`,
  'android/webkit/MimeTypeMap.java': `package android.webkit;

/** Harness stub. */
public class MimeTypeMap {
    private static final MimeTypeMap SINGLETON = new MimeTypeMap();

    public static MimeTypeMap getSingleton() {
        return SINGLETON;
    }

    public String getMimeTypeFromExtension(String extension) {
        return null;
    }
}
`,
  'android/webkit/PermissionRequest.java': `package android.webkit;

/** Harness stub. */
public class PermissionRequest {
    public String[] getResources() {
        return new String[0];
    }

    public void grant(String[] resources) {}

    public void deny() {}
}
`,
  'android/webkit/ValueCallback.java': `package android.webkit;

/** Harness stub. */
public interface ValueCallback<T> {
    void onReceiveValue(T value);
}
`,
  'android/webkit/WebChromeClient.java': `package android.webkit;

import android.content.Intent;
import android.net.Uri;
import android.view.View;

/** Harness stub: every method the real BridgeWebChromeClient overrides or calls. */
public class WebChromeClient {
    public void onShowCustomView(View view, CustomViewCallback callback) {}

    public void onHideCustomView() {}

    public void onPermissionRequest(PermissionRequest request) {}

    public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
        return false;
    }

    public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
        return false;
    }

    public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
        return false;
    }

    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {}

    public boolean onShowFileChooser(
        WebView webView,
        ValueCallback<Uri[]> filePathCallback,
        FileChooserParams fileChooserParams
    ) {
        return false;
    }

    public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
        return false;
    }

    public interface CustomViewCallback {
        void onCustomViewHidden();
    }

    public static class FileChooserParams {
        public static final int MODE_OPEN_MULTIPLE = 2;

        public static Uri[] parseResult(int resultCode, Intent data) {
            return null;
        }

        public Intent createIntent() {
            return new Intent();
        }

        public int getMode() {
            return 0;
        }

        public String[] getAcceptTypes() {
            return new String[0];
        }

        public boolean isCaptureEnabled() {
            return false;
        }
    }
}
`,
  'android/webkit/WebView.java': `package android.webkit;

import android.view.View;

/** Harness stub. */
public class WebView extends View {}
`,
  'android/widget/EditText.java': `package android.widget;

import android.content.Context;
import android.view.View;

/** Harness stub. */
public class EditText extends View {
    public EditText(Context context) {
        super(context);
    }

    public CharSequence getText() {
        return "";
    }
}
`,
  'androidx/activity/result/ActivityResult.java': `package androidx.activity.result;

import android.content.Intent;

/** Harness stub. */
public class ActivityResult {
    private final int resultCode;
    private final Intent data;

    public ActivityResult(int resultCode, Intent data) {
        this.resultCode = resultCode;
        this.data = data;
    }

    public int getResultCode() {
        return resultCode;
    }

    public Intent getData() {
        return data;
    }
}
`,
  'androidx/activity/result/ActivityResultCallback.java': `package androidx.activity.result;

/** Harness stub. */
@FunctionalInterface
public interface ActivityResultCallback<O> {
    void onActivityResult(O result);
}
`,
  'androidx/activity/result/ActivityResultLauncher.java': `package androidx.activity.result;

/**
 * Harness stub. The framework launcher routes launch(input) through the OS
 * request and finally hands contract-parsed results to the registered
 * callback. The probe installs a static observer to play the OS role; the
 * AND-aggregation and the rescue decision stay in real Capacitor code.
 */
public class ActivityResultLauncher<I> {
    public interface LaunchObserver {
        void onLaunch(Object input, ActivityResultCallback<?> callback);
    }

    public static LaunchObserver observer;

    private final ActivityResultCallback<?> callback;

    public ActivityResultLauncher(ActivityResultCallback<?> callback) {
        this.callback = callback;
    }

    @SuppressWarnings("unchecked")
    public void launch(I input) {
        if (observer != null) observer.onLaunch(input, callback);
    }

    public void unregister() {}
}
`,
  'androidx/activity/result/contract/ActivityResultContract.java': `package androidx.activity.result.contract;

import android.content.Context;
import android.content.Intent;

/** Harness stub: same generic shape as the androidx contract. */
public abstract class ActivityResultContract<I, O> {
    public abstract Intent createIntent(Context context, I input);

    public abstract O parseResult(int resultCode, Intent intent);
}
`,
  'androidx/activity/result/contract/ActivityResultContracts.java': `package androidx.activity.result.contract;

import android.content.Context;
import android.content.Intent;

import androidx.activity.result.ActivityResult;

import java.util.HashMap;
import java.util.Map;

/** Harness stub: both contracts the real client constructor registers. */
public class ActivityResultContracts {
    public static class RequestMultiplePermissions extends ActivityResultContract<String[], Map<String, Boolean>> {
        @Override
        public Intent createIntent(Context context, String[] input) {
            return new Intent();
        }

        @Override
        public Map<String, Boolean> parseResult(int resultCode, Intent intent) {
            return new HashMap<>();
        }
    }

    public static class StartActivityForResult extends ActivityResultContract<Intent, ActivityResult> {
        @Override
        public Intent createIntent(Context context, Intent input) {
            return new Intent();
        }

        @Override
        public ActivityResult parseResult(int resultCode, Intent intent) {
            return null;
        }
    }
}
`,
  'androidx/core/app/ActivityCompat.java': `package androidx.core.app;

import android.content.Context;
import android.content.pm.PackageManager;

import java.util.function.BiPredicate;

/**
 * Harness seam. This is the single fake in the permission decision path: on a
 * device checkSelfPermission reads the OS permission state (manifest + user
 * grants); here the probe answers from a controllable map.
 */
public class ActivityCompat {
    public static BiPredicate<Context, String> checkSelfPermissionImpl;

    public static int checkSelfPermission(Context context, String permission) {
        return (checkSelfPermissionImpl != null && checkSelfPermissionImpl.test(context, permission))
            ? PackageManager.PERMISSION_GRANTED
            : PackageManager.PERMISSION_DENIED;
    }
}
`,
  'androidx/core/content/FileProvider.java': `package androidx.core.content;

import android.content.Context;
import android.net.Uri;

import java.io.File;

/** Harness stub. */
public class FileProvider {
    public static Uri getUriForFile(Context context, String authority, File file) {
        return null;
    }
}
`,
  'com/getcapacitor/Bridge.java': `package com.getcapacitor;

import android.app.Activity;
import android.content.Context;

import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContract;

import java.util.ArrayList;
import java.util.List;

/**
 * Harness stub for the real Bridge (context provider). The real class drags
 * in the whole Capacitor runtime; only registerForActivityResult and the
 * context getters are on the decision path. Registrations are recorded so
 * the probe can deliver results to the callback the client registered.
 */
public class Bridge {
    public static final List<Object[]> registrations = new ArrayList<>();

    private final Context context;

    public Bridge(Context context) {
        this.context = context;
    }

    public Context getContext() {
        return context;
    }

    public Activity getActivity() {
        return (Activity) context;
    }

    public <I, O> ActivityResultLauncher<I> registerForActivityResult(
        ActivityResultContract<I, O> contract,
        ActivityResultCallback<O> callback
    ) {
        registrations.add(new Object[] { contract, callback });
        return new ActivityResultLauncher<I>(callback);
    }
}
`,
  'com/getcapacitor/Logger.java': `package com.getcapacitor;

/** Harness stub: logging is not part of the decision logic under test. */
public class Logger {
    public static String tags(String... subtags) {
        if (subtags != null && subtags.length > 0) {
            return "Capacitor/" + String.join("/", subtags);
        }
        return "Capacitor";
    }

    public static void verbose(String message) {}

    public static void verbose(String tag, String message) {}

    public static void debug(String message) {}

    public static void debug(String tag, String message) {}

    public static void info(String message) {}

    public static void info(String tag, String message) {}

    public static void warn(String message) {}

    public static void warn(String tag, String message) {}

    public static void error(String message) {}

    public static void error(String tag, String message, Throwable throwable) {}
}
`,
};

const PROBE_SOURCE = `package probe;

import android.Manifest;
import android.app.Activity;
import android.os.Build;
import android.webkit.GeolocationPermissions;

import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.core.app.ActivityCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JVM decision-table harness for BridgeWebChromeClient.onGeolocationPermissionsShowPrompt.
 *
 * Real code under test (compiled from the store directory this probe is built against):
 *   - BridgeWebChromeClient: the patched/unpatched geolocation prompt decision tree,
 *     including the constructor's AND-over-requested-permissions aggregation.
 *   - PermissionHelper.hasPermissions: the all-granted permission check.
 *
 * Fakes, all at the Android framework seam (exactly where the OS sits on a device):
 *   - ActivityCompat.checkSelfPermission answers from a controllable ambient map.
 *   - The ActivityResultLauncher observer plays the OS request/deliver cycle: it
 *     records the requested permissions, applies the dialog outcome to the ambient
 *     state, and hands a Map<String,Boolean> keyed by the requested permissions
 *     to the registered callback — which is what the framework contract does.
 *
 * Usage: java probe.GeolocationDecisionProbe [patched|unpatched]
 * Prints one PASS/FAIL line per scenario and "failures=N"; exits non-zero on any
 * expectation mismatch.
 */
public class GeolocationDecisionProbe {
    static final String COARSE = Manifest.permission.ACCESS_COARSE_LOCATION;
    static final String FINE = Manifest.permission.ACCESS_FINE_LOCATION;
    static final String ORIGIN = "https://daymark.example";

    /** Ambient OS permission state consulted at the ActivityCompat seam. */
    static final Map<String, Boolean> ambient = new LinkedHashMap<>();

    /** What the simulated permission dialog returns, per requested permission. */
    static Map<String, Boolean> dialogResult;

    /** permissionLauncher.launch(...) inputs, in order. */
    static final List<String[]> launches = new ArrayList<>();

    /** GeolocationPermissions.Callback.invoke(...) arguments, in order. */
    static final List<String[]> invocations = new ArrayList<>();

    static int failures = 0;

    public static void main(String[] args) {
        boolean unpatched = args.length > 0 && "unpatched".equals(args[0]);

        ActivityCompat.checkSelfPermissionImpl =
            (context, permission) -> Boolean.TRUE.equals(ambient.get(permission));

        ActivityResultLauncher.observer =
            (input, callback) -> {
                String[] requested = (String[]) input;
                launches.add(requested);
                if (dialogResult == null) return;
                // The OS applies the dialog outcome to the permission state...
                ambient.putAll(dialogResult);
                // ...and the framework contract parses it into Map<String,Boolean>
                // keyed by the requested permissions for the registered callback.
                Map<String, Boolean> result = new LinkedHashMap<>();
                for (String permission : requested) {
                    result.put(permission, Boolean.TRUE.equals(dialogResult.get(permission)));
                }
                @SuppressWarnings("unchecked")
                ActivityResultCallback<Map<String, Boolean>> permissionCallback =
                    (ActivityResultCallback<Map<String, Boolean>>) callback;
                permissionCallback.onActivityResult(result);
            };

        // Decision table. "before" is the ambient state when the prompt fires,
        // "dialog" the OS request outcome (null = no request is made).
        //
        // pre-granted: both already granted -> allow without asking (fast path).
        row("pre-granted-both", 30, both(true, true), null, false, true);
        // OS grants both requested permissions -> AND(true) -> allow.
        row("dialog-both-granted", 30, both(false, false), both(true, true), true, true);
        // Coarse granted, fine auto-denied (undeclared in Daymark's manifest):
        // the rescue must allow. This is the NEW behaviour; the unpatched
        // upstream copy denies it on API <= 30, which is the regression.
        row("rescue-coarse-only", 30, both(false, false), both(true, false), true, !unpatched);
        row("rescue-coarse-only-sdk24", 24, both(false, false), both(true, false), true, !unpatched);
        row("rescue-coarse-only-sdk31", 31, both(false, false), both(true, false), true, true);
        // OS denies everything -> deny.
        row("denied-both", 30, both(false, false), both(false, false), true, false);
        // Coarse denied while fine granted (impossible for Daymark, but it pins
        // the coarse recheck in isolation) -> AND(false), coarse not granted -> deny.
        row("coarse-denied-only", 30, both(false, false), both(false, true), true, false);

        System.out.println("failures=" + failures);
        if (failures > 0) System.exit(1);
    }

    static Map<String, Boolean> both(boolean coarse, boolean fine) {
        Map<String, Boolean> state = new LinkedHashMap<>();
        state.put(COARSE, coarse);
        state.put(FINE, fine);
        return state;
    }

    static void row(
        String name,
        int sdk,
        Map<String, Boolean> before,
        Map<String, Boolean> dialog,
        boolean expectLaunch,
        boolean expectAllow
    ) {
        Build.VERSION.SDK_INT = sdk;
        ambient.clear();
        ambient.putAll(before);
        dialogResult = dialog;
        launches.clear();
        invocations.clear();

        Bridge bridge = new Bridge(new Activity());
        BridgeWebChromeClient client = new BridgeWebChromeClient(bridge);
        client.onGeolocationPermissionsShowPrompt(
            ORIGIN,
            (origin, allow, retain) -> invocations.add(new String[] { origin, String.valueOf(allow), String.valueOf(retain) })
        );

        boolean launched = !launches.isEmpty();
        boolean allowed = invocations.size() == 1 && Boolean.parseBoolean(invocations.get(0)[1]);
        boolean retained = invocations.size() == 1 && Boolean.parseBoolean(invocations.get(0)[2]);
        String origin = invocations.isEmpty() ? "" : invocations.get(0)[0];

        List<String> problems = new ArrayList<>();
        if (launched != expectLaunch) problems.add("launch=" + launched + " expected=" + expectLaunch);
        if (allowed != expectAllow) problems.add("allow=" + allowed + " expected=" + expectAllow);
        if (invocations.size() != 1) problems.add("invocations=" + invocations.size() + " expected=1");
        if (retained) problems.add("retain=true expected=false (WebView geolocation must not retain across navigations)");
        if (!ORIGIN.equals(origin)) problems.add("origin=" + origin);
        if (launched) {
            String[] requested = launches.get(0);
            if (requested.length != 2 || !COARSE.equals(requested[0]) || !FINE.equals(requested[1])) {
                problems.add("requested=" + names(requested) + " expected=[COARSE,FINE]");
            }
        }

        if (problems.isEmpty()) {
            System.out.println(
                "PASS " + name + " sdk=" + sdk + " requested=" + names(launches.isEmpty() ? new String[0] : launches.get(0)) +
                " launch=" + launched + " allow=" + allowed + " retain=" + retained
            );
        } else {
            failures++;
            System.out.println(
                "FAIL " + name + " sdk=" + sdk + " requested=" + names(launches.isEmpty() ? new String[0] : launches.get(0)) +
                " " + problems
            );
        }
    }

    static String names(String[] permissions) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < permissions.length; i++) {
            if (i > 0) sb.append(",");
            String permission = permissions[i];
            sb.append(permission.startsWith("android.permission.") ? permission.substring("android.permission.".length()) : permission);
        }
        return sb.append("]").toString();
    }
}
`;

/** Locate a JDK: JAVA_HOME, common Homebrew prefixes, then PATH. */
function findJdk(): { javac: string; java: string } | null {
  const roots = [process.env.JAVA_HOME, '/opt/homebrew/opt/openjdk@21', '/opt/homebrew/opt/openjdk'].filter(
    (root): root is string => typeof root === 'string' && root.length > 0,
  );
  for (const root of roots) {
    const javac = path.join(root, 'bin', 'javac');
    const java = path.join(root, 'bin', 'java');
    if (existsSync(javac) && existsSync(java)) return { javac, java };
  }
  const onPath = spawnSync('javac', ['-version'], { encoding: 'utf8' });
  if (onPath.status === 0) return { javac: 'javac', java: 'java' };
  return null;
}

interface ProbeRow {
  status: 'PASS' | 'FAIL';
  name: string;
  sdk: number;
  requested: string[];
  launch: boolean;
  allow: boolean;
  retain: boolean;
}

/** Compile the harness against a store java root and run the decision table. */
function compileAndProbe(javaRoot: string, mode: 'patched' | 'unpatched'): ProbeRow[] {
  const jdk = findJdk();
  expect(jdk, 'a JDK must be available (the describe is skipped otherwise)').not.toBeNull();

  const work = mkdtempSync(path.join(tmpdir(), 'geolocation-rescue-harness-'));
  const stubDir = path.join(work, 'stubs');
  const stubFiles: string[] = [];
  for (const [relative, source] of Object.entries(HARNESS_STUBS)) {
    const file = path.join(stubDir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, source);
    stubFiles.push(file);
  }
  const probeFile = path.join(work, 'probe', 'GeolocationDecisionProbe.java');
  mkdirSync(path.dirname(probeFile), { recursive: true });
  writeFileSync(probeFile, PROBE_SOURCE);

  // The ONLY real sources: the store classes this harness is guarding.
  const realSources = [
    path.join(javaRoot, 'com', 'getcapacitor', 'BridgeWebChromeClient.java'),
    path.join(javaRoot, 'com', 'getcapacitor', 'util', 'PermissionHelper.java'),
    path.join(javaRoot, 'com', 'getcapacitor', 'util', 'InternalUtils.java'),
  ];
  for (const file of realSources) {
    expect(existsSync(file), `${file} must exist (run pnpm install)`).toBe(true);
  }

  const outDir = path.join(work, 'out');
  const compile = spawnSync(jdk!.javac, ['-d', outDir, ...stubFiles, probeFile, ...realSources], {
    encoding: 'utf8',
  });
  expect(compile.status, `javac failed against ${javaRoot}:\n${compile.stderr}`).toBe(0);

  const run = spawnSync(jdk!.java, ['-cp', outDir, 'probe.GeolocationDecisionProbe', mode], { encoding: 'utf8' });
  expect(run.status, `probe failed against ${javaRoot}:\n${run.stdout}\n${run.stderr}`).toBe(0);

  const rows: ProbeRow[] = [];
  let reportedFailures = -1;
  const rowPattern =
    /^(PASS|FAIL) (\S+) sdk=(\d+) requested=(\[[^\]]*\]) launch=(true|false) allow=(true|false) retain=(true|false)$/;
  for (const line of run.stdout.split('\n')) {
    const row = line.match(rowPattern);
    if (row) {
      rows.push({
        status: row[1] as ProbeRow['status'],
        name: row[2],
        sdk: Number(row[3]),
        requested: row[4] === '[]' ? [] : row[4].slice(1, -1).split(','),
        launch: row[5] === 'true',
        allow: row[6] === 'true',
        retain: row[7] === 'true',
      });
    } else if (line.startsWith('failures=')) {
      reportedFailures = Number(line.slice('failures='.length));
    }
  }
  expect(rows, 'the probe must report all seven scenarios').toHaveLength(7);
  expect(reportedFailures, 'the probe must report failures=0').toBe(0);
  return rows;
}

const jdk = findJdk();

(jdk ? describe : describe.skip)('geolocation rescue decision table (compiled JVM harness, no Gradle/device)', () => {
  it(
    'the patched store classes allow coarse-only grants at every API level',
    { timeout: 240_000 },
    () => {
      const rows = compileAndProbe(path.join(patchedGradleProjectDir(), 'src', 'main', 'java'), 'patched');
      const byName = new Map(rows.map((row) => [row.name, row]));

      // Independent expectation table — cross-checked against the probe output.
      const expected: Record<string, { sdk: number; launch: boolean; allow: boolean }> = {
        'pre-granted-both': { sdk: 30, launch: false, allow: true },
        'dialog-both-granted': { sdk: 30, launch: true, allow: true },
        // The NEW behaviour: coarse-only grant must be rescued on API 24–30 too.
        'rescue-coarse-only': { sdk: 30, launch: true, allow: true },
        'rescue-coarse-only-sdk24': { sdk: 24, launch: true, allow: true },
        'rescue-coarse-only-sdk31': { sdk: 31, launch: true, allow: true },
        'denied-both': { sdk: 30, launch: true, allow: false },
        'coarse-denied-only': { sdk: 30, launch: true, allow: false },
      };
      for (const name of Object.keys(expected)) {
        expect(byName.has(name), `scenario ${name} must run`).toBe(true);
      }
      for (const [name, row] of byName) {
        expect(row.status, `${name} reported by the probe`).toBe('PASS');
        expect(row.sdk, name).toBe(expected[name]?.sdk);
        expect(row.launch, name).toBe(expected[name]?.launch);
        expect(row.allow, name).toBe(expected[name]?.allow);
        // The WebView callback must never retain the grant across navigations.
        expect(row.retain, name).toBe(false);
      }

      // The launcher must ask for exactly {COARSE, FINE}: that AND input is what
      // makes the coarse-only rescue necessary (fine is never declared).
      for (const name of [
        'dialog-both-granted',
        'rescue-coarse-only',
        'rescue-coarse-only-sdk24',
        'rescue-coarse-only-sdk31',
        'denied-both',
        'coarse-denied-only',
      ]) {
        expect(byName.get(name)!.requested, name).toEqual(['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION']);
      }
      // Already granted: no second request is made.
      expect(byName.get('pre-granted-both')!.requested).toEqual([]);
    },
  );

  (
    existsSync(path.join(unpatchedJavaRoot, 'com', 'getcapacitor', 'BridgeWebChromeClient.java')) ? it : it.skip
  )(
    'the unpatched upstream copy still denies coarse-only grants below API 31 (negative control)',
    { timeout: 240_000 },
    () => {
      // The store also holds a stale pre-patch twin. Compiling the SAME harness
      // against it must show the gate: coarse-only is denied on API <= 30 and
      // rescued only on API >= 31. This proves the harness catches an unpatched
      // dependency rather than vacuously passing.
      const rows = compileAndProbe(unpatchedJavaRoot, 'unpatched');
      const byName = new Map(rows.map((row) => [row.name, row]));
      expect(byName.get('rescue-coarse-only')!.allow, 'API 30 must be denied by the upstream gate').toBe(false);
      expect(byName.get('rescue-coarse-only-sdk24')!.allow, 'API 24 (minSdk) must be denied by the upstream gate').toBe(false);
      expect(byName.get('rescue-coarse-only-sdk31')!.allow, 'API 31 keeps the upstream rescue').toBe(true);
      expect(byName.get('pre-granted-both')!.allow).toBe(true);
      expect(byName.get('dialog-both-granted')!.allow).toBe(true);
      expect(byName.get('denied-both')!.allow).toBe(false);
      expect(byName.get('coarse-denied-only')!.allow).toBe(false);
    },
  );
});
