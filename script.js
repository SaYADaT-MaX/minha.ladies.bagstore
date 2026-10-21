document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = document.getElementById("menuToggle");
  const mainNav = document.getElementById("mainNav");
  const currentYear = document.getElementById("currentYear");

  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", () => {
      const isOpen = mainNav.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
  }

  const cartCount = document.getElementById("cartCount");

  if (cartCount) {
    cartCount.textContent = "0";
  }
});