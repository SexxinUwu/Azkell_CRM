package com.azkell.fleet;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {

    private WebView mWebView;
    private ProgressBar mProgressBar;
    private FrameLayout mErrorLayout;
    
    // Versión instalada en este build
    public static final int CURRENT_VERSION_CODE = 2;
    public static final String CURRENT_VERSION_NAME = "2.0";

    // URLs del VPS Propio
    private static final String PRIMARY_URL = "https://marsisa.azkell.com/tv";
    private static final String FALLBACK_URL = "https://azkell.com/tv";
    private static final String UPDATE_CHECK_URL = "https://marsisa.azkell.com/api/tv/version";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Fullscreen para Smart TV y Pantallas Grandes
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Layout Principal
        FrameLayout rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(Color.parseColor("#070B14"));

        // Configuración WebView de Alta Definición para Smart TV
        mWebView = new WebView(this);
        mWebView.setBackgroundColor(Color.parseColor("#070B14"));
        mWebView.setFocusable(true);
        mWebView.setFocusableInTouchMode(true);
        mWebView.requestFocus();

        WebSettings ws = mWebView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(true);
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        ws.setCacheMode(WebSettings.LOAD_NO_CACHE);
        
        // Identificador Smart TV
        String originalUa = ws.getUserAgentString();
        ws.setUserAgentString(originalUa + " MarsisaFleetTV/2.0 SmartTV AndroidTV");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        mProgressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        mProgressBar.setMax(100);
        mProgressBar.setVisibility(View.VISIBLE);

        // Pantalla de estado / reconexión
        mErrorLayout = new FrameLayout(this);
        mErrorLayout.setBackgroundColor(Color.parseColor("#070B14"));
        mErrorLayout.setVisibility(View.GONE);
        
        TextView errorText = new TextView(this);
        errorText.setText("Iniciando Marsisa Fleet TV...\nPresiona [OK] para recargar");
        errorText.setTextColor(Color.parseColor("#38BDF8"));
        errorText.setTextSize(20);
        errorText.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        FrameLayout.LayoutParams textParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        );
        textParams.gravity = android.view.Gravity.CENTER;
        mErrorLayout.addView(errorText, textParams);

        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress == 100) {
                    mProgressBar.setVisibility(View.GONE);
                } else {
                    mProgressBar.setVisibility(View.VISIBLE);
                    mProgressBar.setProgress(newProgress);
                }
            }
        });

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                mErrorLayout.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                if (failingUrl != null && failingUrl.contains("marsisa.azkell.com")) {
                    view.loadUrl(FALLBACK_URL);
                } else {
                    mErrorLayout.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                mErrorLayout.setVisibility(View.GONE);
            }
        });

        rootLayout.addView(mWebView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        rootLayout.addView(mProgressBar, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            10
        ));

        rootLayout.addView(mErrorLayout, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        setContentView(rootLayout);

        // Cargar vista TV
        cargarApp();

        // Verificar si hay actualizaciones (Sistema Tipo Xuper TV)
        verificarActualizacionesServidor();
    }

    private void cargarApp() {
        mErrorLayout.setVisibility(View.GONE);
        mWebView.loadUrl(PRIMARY_URL);
    }

    // ── SISTEMA AUTO-UPDATE INTELIGENTE (TIPO XUPER TV) ──────────────
    private void verificarActualizacionesServidor() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    URL url = new URL(UPDATE_CHECK_URL);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(6000);
                    conn.setReadTimeout(6000);
                    conn.setRequestMethod("GET");

                    if (conn.getResponseCode() == 200) {
                        BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                        StringBuilder sb = new StringBuilder();
                        String line;
                        while ((line = reader.readLine()) != null) {
                            sb.append(line);
                        }
                        reader.close();

                        JSONObject json = new JSONObject(sb.toString());
                        final int remoteVersion = json.optInt("versionCode", CURRENT_VERSION_CODE);
                        final String remoteName = json.optString("versionName", "2.0");
                        final String apkUrl = json.optString("apkUrl", "https://marsisa.azkell.com/tv.apk");
                        final String changeLog = json.optString("changeLog", "Mejoras de rendimiento y actualización de interfaz.");

                        if (remoteVersion > CURRENT_VERSION_CODE) {
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    mostrarDialogoActualizacion(remoteName, apkUrl, changeLog);
                                }
                            });
                        }
                    }
                } catch (Exception e) {
                    // Silencioso si no hay internet al arrancar
                }
            }
        }).start();
    }

    private void mostrarDialogoActualizacion(String versionName, final String apkUrl, String changeLog) {
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("🚀 Actualización de Marsisa Fleet TV")
            .setMessage("Nueva versión " + versionName + " disponible.\n\n" + changeLog + "\n\n¿Deseas actualizar ahora?")
            .setCancelable(true)
            .setPositiveButton("Actualizar Ahora", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    descargarEInstalarApk(apkUrl);
                }
            })
            .setNegativeButton("Más tarde", null)
            .show();
    }

    private void descargarEInstalarApk(String apkUrl) {
        try {
            Toast.makeText(this, "Descargando actualización de Marsisa Fleet...", Toast.LENGTH_LONG).show();

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
            request.setTitle("Marsisa Fleet TV Update");
            request.setDescription("Descargando nueva versión...");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "MarsisaFleetUpdate.apk");

            final DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            final long downloadId = dm.enqueue(request);

            registerReceiver(new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id == downloadId) {
                        try {
                            File file = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "MarsisaFleetUpdate.apk");
                            if (file.exists()) {
                                Uri apkUri = FileProvider.getUriForFile(context, getPackageName() + ".fileprovider", file);
                                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                context.startActivity(installIntent);
                            }
                        } catch (Exception e) {
                            Toast.makeText(context, "Error al abrir instalador: " + e.getMessage(), Toast.LENGTH_LONG).show();
                        }
                    }
                }
            }, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));

        } catch (Exception e) {
            Toast.makeText(this, "Error al iniciar descarga: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (mWebView != null) {
            mWebView.clearCache(true);
            mWebView.reload();
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (mErrorLayout.getVisibility() == View.VISIBLE && (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)) {
            cargarApp();
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (mWebView.canGoBack()) {
                mWebView.goBack();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }
}
