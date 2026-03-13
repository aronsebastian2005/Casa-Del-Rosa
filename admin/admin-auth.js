const API =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "https://casa-del-rosa.onrender.com";

const msg = document.getElementById("msg");
const usernameMsg = document.getElementById("usernameMsg");
const passwordMsg = document.getElementById("passwordMsg");
const loadingScreen = document.getElementById("adminLoadingScreen");

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

async function attemptLogin() {
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

  try {
    const res = await fetch(`${API}/api/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data && data.message ? data.message : `Admin login failed (${res.status})`);
    }

    localStorage.setItem("adminToken", data.token);
    localStorage.setItem("adminUsername", data.admin && data.admin.username ? data.admin.username : username);
    loadingScreen.style.display = "flex";

    setTimeout(() => {
      window.location.href = "index.html";
    }, 1000);
  } catch (error) {
    if (/username/i.test(error.message)) {
      setFieldMessage(usernameMsg, error.message);
      msg.textContent = "";
      return;
    }

    if (/password/i.test(error.message)) {
      setFieldMessage(passwordMsg, error.message);
      msg.textContent = "";
      return;
    }

    msg.textContent = error.message;
  }
}

document.getElementById("loginBtn").addEventListener("click", attemptLogin);

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    attemptLogin();
  }
});
