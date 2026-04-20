const msg = document.getElementById("msg");
const usernameMsg = document.getElementById("usernameMsg");
const passwordMsg = document.getElementById("passwordMsg");
const loadingScreen = document.getElementById("adminLoadingScreen");

// If already logged in, redirect to dashboard immediately
if (localStorage.getItem("adminLoggedIn") === "true" && !window.location.href.includes("index.html")) {
    window.location.href = "index.html";
}

function clearFieldMessages() {
  [usernameMsg, passwordMsg].forEach((element) => {
    element.textContent = "";
    element.className = "admin-field-message";
  });
}

function setFieldMessage(element, text) {
  element.textContent = text;
  element.className = "admin-field-message error";
}

function attemptLogin() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  clearFieldMessages();
  msg.textContent = "Signing in...";

  if (!username) {
    setFieldMessage(usernameMsg, "Please enter the admin username.");
    msg.textContent = "";
    return;
  }

  if (!password) {
    setFieldMessage(passwordMsg, "Please enter the admin password.");
    msg.textContent = "";
    return;
  }

  if (username === "admin" && password === "admin123") {
    localStorage.setItem("adminLoggedIn", "true");
    loadingScreen.style.display = "flex";

    setTimeout(() => {
      window.location.href = "index.html";
    }, 1000);
    return;
  }

  msg.textContent = "Invalid admin username or password.";
}

function logoutAdmin() {
    localStorage.removeItem("adminLoggedIn");
    window.location.href = "login.html";
}

if (document.getElementById("loginBtn")) {
  document.getElementById("loginBtn").addEventListener("click", attemptLogin);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    attemptLogin();
  }
});
