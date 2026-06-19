// Auto-select ao focar em inputs numéricos:
// 1º clique seleciona tudo; 2º clique posiciona cursor normalmente
document.addEventListener('focusin', e => {
  if (e.target.matches('input[type="number"]')) {
    setTimeout(() => e.target.select(), 0);
  }
});

App.init();
