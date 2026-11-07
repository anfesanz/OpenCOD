// Public dashboard configuration.
//
// The Supabase "anon" key is designed to be public: it only grants what the
// row-level-security policies in supabase/schema.sql allow. NEVER put the
// service-role key here; it belongs in config/local.env for publish_downloads.py.
//
// While supabaseUrl is empty, downloads are disabled on the public site and
// served from ./data/downloads/ only when the page runs on localhost.
window.LAC_CONFIG = {
  supabaseUrl: "https://gbchdvbtichrkiuenovp.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiY2hkdmJ0aWNocmtpdWVub3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MTM3MzksImV4cCI6MjEwOTM4OTczOX0.KBqKLGhBEKIwm5kjBXuMdmlex5gGWvwDx4xi3P0i93A",
  storageBucket: "mortality-downloads",
  // How long a signed download link stays valid, in seconds.
  signedUrlSeconds: 120,
  // Where Supabase sends people back after they click an emailed link
  // (registration or password reset).
  // Leave empty to use the current page address.
  redirectUrl: "",
  // Set to true to pause registration and downloads on the site. Also turn off
  // sign-ups and drop the storage read policy in Supabase (see README) so the
  // pause is enforced on the server, not just hidden in the page.
  downloadsPaused: false,
  pausedMessage: "Registration and downloads are temporarily paused. Please check back soon.",
};
