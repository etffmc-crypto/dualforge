{
  "targets": [
    {
      "target_name": "sendinput",
      "sources": ["src/sendinput.cc"],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "defines": ["NAPI_VERSION=8", "NAPI_DISABLE_CPP_EXCEPTIONS", "UNICODE", "_UNICODE", "WIN32_LEAN_AND_MEAN"],
      "libraries": ["user32.lib", "psapi.lib"],
      "msvs_settings": { "VCCLCompilerTool": { "ExceptionHandling": 1 } }
    }
  ]
}
