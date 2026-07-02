import React, { useState } from "react";
import { useApp } from "../context/AppData.jsx";

export default function Login() {
  const { signIn, signUp } = useApp();
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr("");
    setMsg("");
    if (!email.trim()) return setErr("Enter your email.");
    if (pw.length < 6) return setErr("Password must be at least 6 characters.");
    setBusy(true);
    try {
      if (mode === "signup") {
        if (pw !== pw2) {
          setBusy(false);
          return setErr("Passwords don't match.");
        }
        await signUp(email, pw, name);
        setMsg(
          "Account created. If email confirmation is on for this project, check your inbox — otherwise sign in now."
        );
        setMode("login");
      } else {
        await signIn(email, pw);
        // On success the session listener swaps in the app automatically.
      }
    } catch (e) {
      setErr(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="eyebrow">Cadence</div>
        <h1>OKR &amp; Daily Task Tracker</h1>

        {mode === "signup" && (
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
        )}
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@team.com"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <div className="field">
          <label>{mode === "signup" ? "Create a password" : "Password"}</label>
          <input
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Enter your password"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        {mode === "signup" && (
          <div className="field">
            <label>Confirm password</label>
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="Re-enter password"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
        )}

        <div className="err">{err}</div>
        {msg && <div className="note">{msg}</div>}

        <button className="btn block" onClick={submit} disabled={busy}>
          {busy ? "…" : mode === "signup" ? "Create account" : "Log in"}
        </button>

        <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--muted)" }}>
          {mode === "login" ? (
            <>
              New here?{" "}
              <button className="linkbtn" onClick={() => { setMode("signup"); setErr(""); }}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Have an account?{" "}
              <button className="linkbtn" onClick={() => { setMode("login"); setErr(""); }}>
                Log in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
