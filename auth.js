// Registration, password sign-in and signed downloads (Supabase).
// Registering (or "Forgot your password?") emails a link; opening it signs the
// user in and asks them to set a password, which they use from then on.
// Exposes window.LacAuth; app.js calls LacAuth.download(...) and listens for
// account changes with LacAuth.onChange(...).
(function () {
  const config = window.LAC_CONFIG || {};
  const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const enabled = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
  const paused = Boolean(config.downloadsPaused);
  const pausedMessage =
    config.pausedMessage || "Registration and downloads are temporarily paused. Please check back soon.";
  const client = enabled ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;

  const listeners = new Set();
  let session = null;
  let profile = null;
  let pendingDownload = null;
  // Read before supabase-js consumes the URL hash of a password-reset link.
  let recoveryLink = /(^#|&)type=recovery(&|$)/.test(window.location.hash);

  const dialog = document.getElementById("auth-dialog");
  const message = document.getElementById("auth-message");
  const accountButton = document.getElementById("account-button");

  function redirectUrl() {
    return config.redirectUrl || `${window.location.origin}${window.location.pathname}`;
  }

  function setMessage(text, tone = "info") {
    message.textContent = text;
    message.dataset.tone = tone;
  }

  function showView(view) {
    for (const name of ["signin", "register", "forgot", "password", "account"]) {
      document.getElementById(`auth-view-${name}`).hidden = name !== view;
    }
  }

  function openDialog(view, text = "") {
    showView(view);
    setMessage(text);
    if (!dialog.open) dialog.showModal();
  }

  async function loadProfile() {
    profile = null;
    if (!session) return;
    const { data, error } = await client
      .from("profiles")
      .select("full_name, institution, country")
      .eq("id", session.user.id)
      .maybeSingle();
    if (!error) profile = data;
  }

  function notify() {
    accountButton.textContent = session ? "Account" : "Sign in";
    accountButton.hidden = !enabled || paused;
    for (const listener of listeners) listener({ session, profile });
  }

  function needsPassword() {
    return Boolean(session) && (recoveryLink || session.user.user_metadata?.password_set !== true);
  }

  // Someone who arrived from an emailed link must choose a password first.
  function promptForPassword() {
    if (!needsPassword()) return;
    openDialog(
      "password",
      recoveryLink ? "Choose a new password." : "Your email is confirmed. Choose a password to finish."
    );
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  // Registration link: creates the account if needed and signs the user in,
  // after which promptForPassword() asks them to set a password.
  async function sendLink(email, extra = {}) {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl(), ...extra },
    });
    if (error) throw error;
  }

  // --- form handlers -------------------------------------------------------
  document.getElementById("signin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const { email, password } = formData(event.target);
    setMessage("Signing in…");
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setMessage(
        /invalid login credentials/i.test(error.message)
          ? "Email or password is incorrect. Not registered yet, or never set a password? Use the links below."
          : error.message,
        "error"
      );
      return;
    }
    event.target.reset();
    session = data.session;
    await loadProfile();
    notify();
    setMessage("");
    if (pendingDownload) {
      if (!profile) return download(pendingDownload.country, pendingDownload.item);
      return resumeDownload();
    }
    dialog.close();
  });

  document.getElementById("forgot-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = formData(event.target).email.trim();
    setMessage("Sending…");
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
    if (error) return setMessage(error.message, "error");
    setMessage(`If ${email} is registered, a link to set a new password is on its way.`, "success");
  });

  document.getElementById("password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const { password, confirm } = formData(event.target);
    if (password !== confirm) return setMessage("The passwords don’t match.", "error");
    setMessage("Saving…");
    const { error } = await client.auth.updateUser({ password, data: { password_set: true } });
    if (error) return setMessage(error.message, "error");
    event.target.reset();
    recoveryLink = false;
    const { data } = await client.auth.getSession();
    session = data.session;
    notify();
    if (pendingDownload && profile) return resumeDownload();
    if (!profile) {
      const form = document.getElementById("register-form");
      form.elements.email.value = session.user.email;
      form.elements.email.readOnly = true;
      return openDialog("register", "Password saved. Please complete your registration to download data.");
    }
    openDialog("account", "Password saved. Next time, sign in with your email and password.");
    document.getElementById("account-details").textContent =
      `Signed in as ${session.user.email} · ${profile.full_name}, ${profile.institution}`;
  });

  document.getElementById("register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (paused) return setMessage(pausedMessage, "error");
    const values = formData(event.target);
    const metadata = {
      full_name: values.full_name.trim(),
      institution: values.institution.trim(),
      country: values.country.trim(),
      intended_use: values.intended_use.trim(),
      accepted_terms: values.accepted_terms === "on",
    };
    setMessage("Registering…");
    try {
      if (session) {
        // Signed-in user who never completed the form: store details now.
        const { error } = await client.auth.updateUser({ data: metadata });
        if (error) throw error;
        await loadProfile();
        notify();
        setMessage("Thanks — your registration is complete.", "success");
        resumeDownload();
        return;
      }
      await sendLink(values.email.trim(), { shouldCreateUser: true, data: metadata });
      setMessage(
        `Almost done: open the link we sent to ${values.email} to confirm your email and set your password.`,
        "success"
      );
    } catch (error) {
      setMessage(error.message, "error");
    }
  });

  document.getElementById("signout-button").addEventListener("click", async () => {
    await client.auth.signOut();
    dialog.close();
  });

  for (const button of dialog.querySelectorAll("[data-auth-view]")) {
    button.addEventListener("click", () => openDialog(button.dataset.authView));
  }

  accountButton.addEventListener("click", () => {
    if (!session) return openDialog("signin");
    document.getElementById("account-details").textContent = profile
      ? `Signed in as ${session.user.email} · ${profile.full_name}, ${profile.institution}`
      : `Signed in as ${session.user.email}. Complete your registration to download data.`;
    openDialog("account");
  });

  // --- downloads -----------------------------------------------------------
  function objectPath(filename) {
    return filename.replace(/\.csv$/i, "") + ".zip";
  }

  async function download(country, item) {
    if (paused) {
      openDialog("signin", pausedMessage);
      return;
    }
    if (!enabled) {
      if (isLocalhost) {
        window.location.href = item.path; // local development: serve the raw CSV
        return;
      }
      openDialog("signin", "Downloads are not available yet. Please check back soon.");
      return;
    }
    pendingDownload = { country, item };
    if (needsPassword()) return promptForPassword();
    if (!session) {
      openDialog("signin", `Sign in or register to download the ${country} data.`);
      return;
    }
    if (!profile) {
      const form = document.getElementById("register-form");
      form.elements.email.value = session.user.email;
      form.elements.email.readOnly = true;
      openDialog("register", "Please complete your registration to download data.");
      return;
    }
    await resumeDownload();
  }

  async function resumeDownload() {
    if (!pendingDownload || !session || !profile) return;
    const { country, item } = pendingDownload;
    pendingDownload = null;
    const path = objectPath(item.filename);
    const { data, error } = await client.storage
      .from(config.storageBucket)
      .createSignedUrl(path, config.signedUrlSeconds || 120, { download: path });
    if (error) {
      openDialog("account", `Download failed: ${error.message}`);
      return;
    }
    // Logging must not block the download.
    client.from("download_log").insert({ country, object_path: path }).then(() => {});
    if (dialog.open) dialog.close();
    window.location.href = data.signedUrl;
  }

  // --- session lifecycle ---------------------------------------------------
  async function init() {
    if (!enabled) {
      notify();
      return;
    }
    const { data } = await client.auth.getSession();
    session = data.session;
    await loadProfile();
    notify();
    promptForPassword();
    client.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") recoveryLink = true;
      // Defer Supabase calls out of the auth callback (avoids a client deadlock).
      setTimeout(async () => {
        const changed = (nextSession?.user?.id || null) !== (session?.user?.id || null);
        session = nextSession;
        if (changed) await loadProfile();
        notify();
        if (changed || event === "PASSWORD_RECOVERY") promptForPassword();
      }, 0);
    });
  }

  window.LacAuth = {
    enabled,
    paused,
    pausedMessage,
    isLocalhost,
    init,
    download,
    onChange(listener) {
      listeners.add(listener);
    },
    get state() {
      return { session, profile };
    },
  };
})();
