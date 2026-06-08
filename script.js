function toggleMenu(event) {
  if (event) event.preventDefault();
  document.getElementById('sidebar').classList.toggle('open');
  document.querySelector('.sidebar-overlay').classList.toggle('open');
}

document.querySelector('.mobile-menu-btn')?.addEventListener('touchend', toggleMenu);
document.querySelector('.sidebar-overlay')?.addEventListener('touchend', toggleMenu);
