const Theme = {
  current: null,

  init() {
    const saved = localStorage.getItem('theme');
    this.current = saved || this._autoTheme();
    this._apply();
    // Re-check every minute for auto-switch (only if no manual override)
    setInterval(() => {
      if (!localStorage.getItem('theme')) {
        const next = this._autoTheme();
        if (next !== this.current) {
          this.current = next;
          this._apply();
          this._updateBtn();
        }
      }
    }, 60000);
  },

  _autoTheme() {
    const h = new Date().getHours();
    return (h >= 18 || h < 6) ? 'dark' : 'light';
  },

  toggle() {
    this.current = this.current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', this.current);
    this._apply();
    this._updateBtn();
  },

  _apply() {
    document.body.classList.toggle('light', this.current === 'light');
    this._updateBtn();
  },

  _updateBtn() {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = this.current === 'dark' ? '☀️' : '🌙';
  }
};

Theme.init();
