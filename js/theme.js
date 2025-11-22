// Read stored theme safely from localStorage and apply it
const storedTheme = (typeof localStorage !== 'undefined') ? localStorage.getItem('theme') : null;
const lightmode = document.getElementById('lightThemeButton');
const darkmodeBtn = document.getElementById('darkThemeButton');

if (storedTheme === 'dark') {
    document.body.classList.add('darktheme');
}

if (darkmodeBtn) {
    darkmodeBtn.addEventListener('click', () => {
        document.body.classList.add('darktheme');
        try { localStorage.setItem('theme', 'dark'); } catch(e){}
    });
}
if (lightmode) {
    lightmode.addEventListener('click', () => {
        document.body.classList.remove('darktheme');
        try { localStorage.setItem('theme', 'light'); } catch(e){}
    });
}