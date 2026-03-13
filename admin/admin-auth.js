function attemptLogin() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("msg");

  if (username === "admin" && password === "admin123") {
    localStorage.setItem("adminLoggedIn", "true");
    window.location.href = "index.html";
  } else {
    msg.textContent = "Invalid admin username or password.";
  }
}

document.getElementById("loginBtn").addEventListener("click", attemptLogin);

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    attemptLogin();
  }
});
