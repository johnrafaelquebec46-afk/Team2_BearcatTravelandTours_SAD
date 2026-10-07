const products = [
    { id: 1, name: "Matcha Melties", notif: "This Week only!", image: "assets/MATCHA.png", bg: "#75672C", desc: "Soft matcha cookies with sweet white chocolate chunks. The earthy matcha flavors pairs perfectly with creamy white chocolate for a unique sweet treat." },
    { id: 2, name: "Biscoff Choco Crunch", notif: "This Week only!", image: "assets/BISCOFF.png", bg: "#A15D24", desc: "A delicious Biscoff Cookie topped with a white and dark chocolate. A rich and indulgent combination for those who love extra chocolate in every bite." },
    { id: 3, name: "Oatie Choco Paws", notif: "This Week only!", image: "assets/OATMEAL.png", bg: "#CEA386", desc: "Chewy oatmeal filled with chocolate pieces. A comforting treat with the hearty taste of oats and the sweetness of chocolate." },
    { id: 4, name: "Choco Crinkles", notif: "This Week only!", image: "assets/CRINKLES.png", bg: "#554C4E", desc: "Soft chocolate crinkle cookies covered with a snowy layer of powdered sugar. Rich, chocolatey, and perfect for anyone who loves a classic crinkle." }
];
const classics = [
    { id: 1, name: "Chocolate Chip", notif: "Best Sellers", image: "assets/CHOCOLATECHIP.png", bg: "#CEA386", desc: "Soft and chewy cookies packed with chocolate chips. A clasic favorite that gives you a sweet and a chocolatey treat in every bite." },
    { id: 2, name: "Red Velvet Cloud bites", notif: "Best Sellers", image: "assets/REDVELVET.png", bg: "#93494A", desc: "Rich red velvet cookies combined with a creamy white chocolate chunks." }
]

function populateList() {
    const container = document.getElementById('product-grid');
    const container2 = document.getElementById('classics');
    const template = document.getElementById('card-template');
    const template2 = document.getElementById('card-template2');

    container.innerHTML = '';

    products.forEach(product => {
        const even = product.id%2;
        const activeTemplate = even === 0 ? template2:template;

        const cardClone = activeTemplate.content.cloneNode(true);
        const img = cardClone.querySelector('.product-img');
        img.src = product.image;
        img.alt = product.name;

        const card = cardClone.querySelector('.product-card').style.backgroundColor = product.bg;
        const header = cardClone.querySelector('.card-header').textContent = product.name;
        const notif = cardClone.querySelector('.card-notif').textContent = product.notif;
        const parag = cardClone.querySelector('.card-p').textContent = product.desc;
        const btn1 = cardClone.querySelector('.info-btn').textContent = 'Learn More';
        const btn2 = cardClone.querySelector('.order-btn').textContent = 'Order Now';

        container.appendChild(cardClone);
    });
    container2.innerHTML='';
    classics.forEach(classic => {
        const even = classic.id%2;
        const activeTemplate = even === 0 ? template2:template;

        const cardClone = activeTemplate.content.cloneNode(true);
        const img = cardClone.querySelector('.product-img');
        img.src = classic.image;
        img.alt = classic.name;

        const card = cardClone.querySelector('.product-card').style.backgroundColor = classic.bg;
        const header = cardClone.querySelector('.card-header').textContent = classic.name;
        const notif = cardClone.querySelector('.card-notif').textContent = classic.notif;
        const parag = cardClone.querySelector('.card-p').textContent = classic.desc;
        const btn1 = cardClone.querySelector('.info-btn').textContent = 'Learn More';
        const btn2 = cardClone.querySelector('.order-btn').textContent = 'Order Now';

        container2.appendChild(cardClone);
    });
}

document.addEventListener('DOMContentLoaded', populateList);