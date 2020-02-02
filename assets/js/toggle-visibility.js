function toggleClass(className) {
    var x = document.getElementsByClassName(className);
    if (x.style.display === "none") {
        x.style.display = "block";
    } else {
        x.style.display = "none";
    }
}