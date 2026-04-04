// ===========================
// NAVBAR SCROLL
// ===========================
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
});

// ===========================
// HAMBURGER / MOBILE MENU
// ===========================
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileMenu.classList.toggle('open');
  document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
});

document.querySelectorAll('.mobile-link, .mobile-menu .btn').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    mobileMenu.classList.remove('open');
    document.body.style.overflow = '';
  });
});

// ===========================
// SMOOTH SCROLL
// ===========================
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ===========================
// SCROLL REVEAL
// ===========================
const reveals = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
reveals.forEach(el => revealObserver.observe(el));

// ===========================
// TYPING EFFECT (HERO)
// ===========================
const typingEl = document.getElementById('typingTarget');
const words = ['Automatically.', 'Intelligently.', 'Instantly.', '24/7.'];
let wIdx = 0, cIdx = 0, deleting = false;
function typeEffect() {
  const word = words[wIdx];
  if (!deleting) {
    typingEl.textContent = word.substring(0, cIdx + 1);
    cIdx++;
    if (cIdx === word.length) { deleting = true; setTimeout(typeEffect, 1800); return; }
  } else {
    typingEl.textContent = word.substring(0, cIdx - 1);
    cIdx--;
    if (cIdx === 0) { deleting = false; wIdx = (wIdx + 1) % words.length; }
  }
  setTimeout(typeEffect, deleting ? 60 : 95);
}
setTimeout(typeEffect, 1000);

// ===========================
// HERO CHAT ANIMATION
// ===========================
const heroMessages = [
  { role: 'user', text: 'Do you have this in size 42?' },
  { role: 'ai',   text: 'Yes! Size 42 is available in Black, White, and Navy Blue. Want me to reserve one for you? 😊' },
  { role: 'user', text: 'Yes please, the black one.' },
  { role: 'ai',   text: 'Done! 🎉 I\'ve reserved the Black Size 42 for you. Shall I proceed to checkout? I can take payment right here.' },
];

function createMsg(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'ai' ? '🤖' : 'U';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  div.appendChild(avatar);
  div.appendChild(bubble);
  return div;
}

function createTyping() {
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.id = 'typingMsg';
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '🤖';
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  [1,2,3].forEach(() => { const d = document.createElement('div'); d.className = 'typing-dot'; indicator.appendChild(d); });
  div.appendChild(avatar);
  div.appendChild(indicator);
  return div;
}

const heroChat = document.getElementById('heroChatMessages');
let msgIdx = 0;

function showNextMsg() {
  if (msgIdx >= heroMessages.length) {
    setTimeout(() => { heroChat.innerHTML = ''; msgIdx = 0; setTimeout(showNextMsg, 600); }, 3000);
    return;
  }
  const m = heroMessages[msgIdx];
  if (m.role === 'ai') {
    const t = createTyping();
    heroChat.appendChild(t);
    heroChat.scrollTop = heroChat.scrollHeight;
    setTimeout(() => {
      const typing = document.getElementById('typingMsg');
      if (typing) typing.remove();
      const msg = createMsg('ai', m.text);
      msg.style.animationDelay = '0s';
      heroChat.appendChild(msg);
      heroChat.scrollTop = heroChat.scrollHeight;
      msgIdx++;
      setTimeout(showNextMsg, 1400);
    }, 1200);
  } else {
    const msg = createMsg('user', m.text);
    msg.style.animationDelay = '0s';
    heroChat.appendChild(msg);
    heroChat.scrollTop = heroChat.scrollHeight;
    msgIdx++;
    setTimeout(showNextMsg, 800);
  }
}
setTimeout(showNextMsg, 1200);

// ===========================
// LIVE DEMO CHAT
// ===========================
const demoBody = document.getElementById('demoChatBody');
const demoInput = document.getElementById('demoInput');
const demoSend = document.getElementById('demoSend');

const demoInitMsgs = [
  { role: 'ai', text: '👋 Hello! Welcome to our store. How can I help you today?' },
];
demoInitMsgs.forEach((m, i) => {
  const msg = createDemoMsg(m.role, m.text);
  msg.style.animationDelay = `${i * 0.15}s`;
  demoBody.appendChild(msg);
});

const aiReplies = {
  default: ["Great question! Let me check that for you. 😊", "I'd be happy to help! We have a wide range of options available.", "Sure thing! Our team can assist with that. Would you like more details?", "Absolutely! We have exactly what you're looking for."],
  product: ["We carry over 500 products across 12 categories. Our best sellers are in the fashion and electronics sections. What are you looking for specifically?", "Our top products right now are the Premium Wireless Headphones ($89), Leather Sneakers ($120), and Smart Fitness Watch ($149). Shall I show you details on any of these?"],
  price: ["Our prices start from $15 for accessories to $299 for premium electronics. We also offer bundle discounts — buy 2 get 10% off! 🎉", "Great news — we have a 20% off sale happening right now on selected items. Want me to show you the deals?"],
  shipping: ["We offer free shipping on orders over $50! Standard delivery is 3-5 days, or choose express (1-2 days) for a small fee.", "We ship to over 40 countries. Delivery to your region typically takes 5-7 business days. 🚚"],
  order: ["I can help you place an order right here! Just tell me what you'd like, and I'll walk you through checkout. 🛒", "Your order can be tracked via the link sent to your email after purchase. Need help finding a specific order?"],
};

function getAIReply(input) {
  const t = input.toLowerCase();
  if (t.match(/product|item|sell|have|stock|catalog/)) return aiReplies.product[Math.floor(Math.random()*2)];
  if (t.match(/price|cost|how much|discount|sale/)) return aiReplies.price[Math.floor(Math.random()*2)];
  if (t.match(/ship|deliver|shipping|fast/)) return aiReplies.shipping[Math.floor(Math.random()*2)];
  if (t.match(/order|buy|purchase|checkout/)) return aiReplies.order[Math.floor(Math.random()*2)];
  return aiReplies.default[Math.floor(Math.random()*aiReplies.default.length)];
}

function createDemoMsg(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.style.opacity = '0';
  div.style.transform = 'translateY(10px)';
  div.style.animation = 'msgIn 0.35s ease forwards';
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'ai' ? '🤖' : '👤';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  div.appendChild(avatar);
  div.appendChild(bubble);
  return div;
}

function sendDemoMessage() {
  const val = demoInput.value.trim();
  if (!val) return;
  demoBody.appendChild(createDemoMsg('user', val));
  demoInput.value = '';
  demoBody.scrollTop = demoBody.scrollHeight;

  const t = createTyping();
  t.id = 'demoTyping';
  demoBody.appendChild(t);
  demoBody.scrollTop = demoBody.scrollHeight;

  setTimeout(() => {
    const dt = document.getElementById('demoTyping');
    if (dt) dt.remove();
    demoBody.appendChild(createDemoMsg('ai', getAIReply(val)));
    demoBody.scrollTop = demoBody.scrollHeight;
  }, 1100);
}

demoSend.addEventListener('click', sendDemoMessage);
demoInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendDemoMessage(); });

// ===========================
// FLOATING CHAT WIDGET
// ===========================
const chatBubble = document.getElementById('chatBubble');
const chatPanel = document.getElementById('chatPanel');
const widgetClose = document.getElementById('widgetClose');
const widgetMessages = document.getElementById('widgetMessages');
const widgetInput = document.getElementById('widgetInput');
const widgetSendBtn = document.getElementById('widgetSendBtn');

let widgetOpen = false;

chatBubble.addEventListener('click', () => {
  widgetOpen = !widgetOpen;
  chatPanel.classList.toggle('open', widgetOpen);
  chatBubble.textContent = widgetOpen ? '✕' : '💬';
});
widgetClose.addEventListener('click', () => {
  widgetOpen = false;
  chatPanel.classList.remove('open');
  chatBubble.textContent = '💬';
});

const widgetAIReplies = [
  "Hi there! 👋 I'm Sellaris AI. I can show you how we can boost your sales by up to 3x. Want a quick demo?",
  "Great to hear from you! Our AI handles customer inquiries 24/7 so you never miss a sale. Want to see pricing?",
  "Absolutely! We integrate with WhatsApp, Instagram, your website, and 20+ more platforms in minutes.",
  "Our Growth plan at $79/month is perfect for most businesses. It includes 5 platforms and 5,000 AI conversations. Shall I start your free trial?",
  "I'd love to help! You can start with our 14-day free trial — no credit card required. Shall I set that up for you?",
];
let widgetReplyIdx = 0;

function addWidgetMsg(role, text) {
  const div = document.createElement('div');
  div.className = `w-msg${role === 'user' ? ' user-msg' : ''}`;
  div.style.animation = 'msgIn 0.3s ease forwards';
  const avatar = document.createElement('div');
  avatar.className = 'w-msg-avatar';
  avatar.textContent = role === 'ai' ? '🤖' : '👤';
  const bubble = document.createElement('div');
  bubble.className = 'w-msg-bubble';
  bubble.textContent = text;
  div.appendChild(avatar);
  div.appendChild(bubble);
  widgetMessages.appendChild(div);
  widgetMessages.scrollTop = widgetMessages.scrollHeight;
}

function sendWidgetMessage() {
  const val = widgetInput.value.trim();
  if (!val) return;
  addWidgetMsg('user', val);
  widgetInput.value = '';
  setTimeout(() => {
    addWidgetMsg('ai', widgetAIReplies[widgetReplyIdx % widgetAIReplies.length]);
    widgetReplyIdx++;
  }, 900);
}

widgetSendBtn.addEventListener('click', sendWidgetMessage);
widgetInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendWidgetMessage(); });