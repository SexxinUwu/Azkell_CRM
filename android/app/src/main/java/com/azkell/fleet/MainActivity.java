package com.azkell.fleet;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

public class MainActivity extends Activity {

    private WebView mWebView;
    private ProgressBar mProgressBar;
    private FrameLayout mErrorLayout;
    
    // URL Principal del ERP en VPS Propio (Marsisa / Azkell)
    private static final String PRIMARY_URL = "https://marsisa.azkell.com/tv";
    private static final String FALLBACK_URL = "https://azkell.com/tv";

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

        // Configuración WebView de Alta Definición
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
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        
        // Identificador Smart TV
        String originalUa = ws.getUserAgentString();
        ws.setUserAgentString(originalUa + " AzkellFleetTV/2.0 SmartTV AndroidTV");

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
        errorText.setText("Iniciando Azkell Fleet TV...\nPresiona [OK] para recargar");
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
                // Si la URL de Marsisa tiene intermitencia momentánea, intentar con azkell.com
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

        // Iniciar carga del sistema
        cargarApp();
    }

    private void cargarApp() {
        mErrorLayout.setVisibility(View.GONE);
        mWebView.loadUrl(PRIMARY_URL);
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
