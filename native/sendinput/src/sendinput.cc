#include <napi.h>
#include <windows.h>
#include <string>

namespace {

bool IsExtended(UINT vk) {
  switch (vk) {
    case VK_RIGHT: case VK_LEFT: case VK_UP: case VK_DOWN:
    case VK_HOME: case VK_END: case VK_PRIOR: case VK_NEXT:
    case VK_INSERT: case VK_DELETE: case VK_DIVIDE: case VK_NUMLOCK:
    case VK_RCONTROL: case VK_RMENU:
    case VK_LWIN: case VK_RWIN: case VK_APPS: case VK_SNAPSHOT:
      return true;
    default:
      return false;
  }
}

void Send(INPUT* in) { ::SendInput(1, in, sizeof(INPUT)); }

Napi::Value SendKey(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsBoolean()) {
    Napi::TypeError::New(env, "sendKey(vk: number, down: boolean)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  UINT vk = info[0].As<Napi::Number>().Uint32Value();
  bool down = info[1].As<Napi::Boolean>().Value();
  INPUT in = {};
  in.type = INPUT_KEYBOARD;
  in.ki.wScan = static_cast<WORD>(::MapVirtualKeyW(vk, MAPVK_VK_TO_VSC));
  in.ki.dwFlags = KEYEVENTF_SCANCODE | (down ? 0 : KEYEVENTF_KEYUP) | (IsExtended(vk) ? KEYEVENTF_EXTENDEDKEY : 0);
  if (in.ki.wScan == 0) {   // no scan code (e.g. media keys): fall back to the virtual key
    in.ki.wVk = static_cast<WORD>(vk);
    in.ki.dwFlags = (down ? 0 : KEYEVENTF_KEYUP) | (IsExtended(vk) ? KEYEVENTF_EXTENDEDKEY : 0);
  }
  Send(&in);
  return env.Undefined();
}

Napi::Value SendMouseButton(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsBoolean()) {
    Napi::TypeError::New(env, "sendMouseButton(button: 0|1|2, down: boolean)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  int b = info[0].As<Napi::Number>().Int32Value();
  bool down = info[1].As<Napi::Boolean>().Value();
  DWORD flag;
  switch (b) {
    case 0: flag = down ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP; break;
    case 1: flag = down ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP; break;
    case 2: flag = down ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP; break;
    default: Napi::RangeError::New(env, "button must be 0, 1 or 2").ThrowAsJavaScriptException(); return env.Undefined();
  }
  INPUT in = {};
  in.type = INPUT_MOUSE;
  in.mi.dwFlags = flag;
  Send(&in);
  return env.Undefined();
}

Napi::Value SendMouseMove(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "sendMouseMove(dx: number, dy: number)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  INPUT in = {};
  in.type = INPUT_MOUSE;
  in.mi.dx = info[0].As<Napi::Number>().Int32Value();
  in.mi.dy = info[1].As<Napi::Number>().Int32Value();
  in.mi.dwFlags = MOUSEEVENTF_MOVE;
  Send(&in);
  return env.Undefined();
}

Napi::Value ForegroundProcessName(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  HWND hwnd = ::GetForegroundWindow();
  if (!hwnd) return Napi::String::New(env, "");
  DWORD pid = 0;
  ::GetWindowThreadProcessId(hwnd, &pid);
  if (!pid) return Napi::String::New(env, "");
  HANDLE h = ::OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!h) return Napi::String::New(env, "");
  wchar_t buf[MAX_PATH * 2];
  DWORD len = static_cast<DWORD>(sizeof(buf) / sizeof(buf[0]));
  BOOL ok = ::QueryFullProcessImageNameW(h, 0, buf, &len);
  ::CloseHandle(h);
  if (!ok) return Napi::String::New(env, "");
  std::wstring path(buf, len);
  size_t slash = path.find_last_of(L"\\/");
  std::wstring base = slash == std::wstring::npos ? path : path.substr(slash + 1);
  return Napi::String::New(env, reinterpret_cast<const char16_t*>(base.c_str()), base.size());
}

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("sendKey", Napi::Function::New(env, SendKey));
  exports.Set("sendMouseButton", Napi::Function::New(env, SendMouseButton));
  exports.Set("sendMouseMove", Napi::Function::New(env, SendMouseMove));
  exports.Set("foregroundProcessName", Napi::Function::New(env, ForegroundProcessName));
  return exports;
}

NODE_API_MODULE(sendinput, Init)
