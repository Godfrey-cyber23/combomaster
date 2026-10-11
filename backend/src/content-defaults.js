const products = [
  ['supplements', 'Whey Protein — Double Chocolate', '5 lb / 2.27 kg', 'K2,700', 'https://res.cloudinary.com/xfcqi4ts/image/upload/v1788716002/IMG-20260904-WA0028.jpg'],
  ['supplements', 'Whey Protein — Vanilla Ice-Cream', '1.5 lb / 682 g', 'K1,700', 'https://res.cloudinary.com/xfcqi4ts/image/upload/v1788718772/IMG-20260904-WA0026_1.jpg'],
  ['supplements', 'Whey Protein — Banana', '2.2 lb / 35.2 oz', 'K500', 'https://res.cloudinary.com/xfcqi4ts/image/upload/v1788714065/IMG-20260904-WA0015_1.jpg'],
  ['supplements', 'USN Super Grow Beast', '4 kg', 'K900', 'https://res.cloudinary.com/xfcqi4ts/image/upload/v1788716996/IMG-20260906-WA0012.jpg'],
  ['supplements', 'Optimum Nutrition Creatine', '60 capsules', 'K850', 'https://res.cloudinary.com/xfcqi4ts/image/upload/v1788717627/IMG-20260904-WA0029.jpg'],
  ['supplements', 'Whey Protein Powder — Matcha', '2.2 lb / 35.2 oz', 'K500', 'https://res.cloudinary.com/xfcqi4ts/image/upload/v1788719515/IMG-20260904-WA0021.jpg'],
  ['supplements', 'Whey Protein Powder — Strawberry', '2.2 lb / 35.2 oz', 'K500', 'https://res.cloudinary.com/xfcqi4ts/image/upload/v1788716608/IMG-20260906-WA0008.jpg'],
  ['supplements', 'Serious Mass — Chocolate', '12 lb / 5.44 kg', 'K500', 'https://res.cloudinary.com/xfcqi4ts/image/upload/v1788722499/IMG-20260904-WA0025.jpg'],
  ['supplements', 'Serious Mass — Strawberry', '2.73 kg', 'K500', 'https://res.cloudinary.com/xfcqi4ts/image/upload/v1788720157/IMG-20260904-WA0027.jpg'],
  ['supplements', 'Hibiscus', 'Natural drink', 'K8', 'https://res.cloudinary.com/xfcqi4ts/image/upload/v1788722073/HIBISCUS_Drink.jpg'],
  ['supplements', 'Pro Mass', '30-day supply', 'K500', 'https://res.cloudinary.com/xfcqi4ts/image/upload/v1788717790/IMG-20260906-WA0014.jpg'],
  ['attire', 'CM Gym T-Shirt', 'S / M / L / XL', 'K25', '/images/shop-tshirt.jpg', 'tall'],
  ['attire', 'CM Training Vest', 'S / M / L / XL', 'K22', '/images/shop-vest.jpg', 'tall'],
  ['attire', 'CM Workout Shorts', 'M / L / XL', 'K20', '/images/shop-shorts.jpg', 'tall'],
  ['attire', 'Gym Gloves', 'S / M / L / XL', 'K350', 'https://res.cloudinary.com/xfcqi4ts/image/upload/v1788721722/IMG-20260906-WA0005.jpg', 'tall'],
  ['attire', 'CM Gym Hoodie', 'M / L / XL / XXL', 'K40', '/images/shop-hoodie.jpg', 'tall'],
  ['equipment', 'Dumbbell Set', '5–25 kg pairs', 'K120', '/images/shop-dumbbells.jpg'],
  ['equipment', 'Resistance Bands', 'Set of 5', 'K18', '/images/shop-bands.jpg'],
  ['equipment', 'Speed Rope', 'Adjustable', 'K12', '/images/shop-rope.jpg'],
  ['equipment', 'Ab Roller', 'Pro quality', 'K15', '/images/shop-abroller.jpg']
].map(([category, title, unit, price, imageUrl, shape]) => ({
  page: 'shop',
  kind: 'product',
  category,
  title,
  unit,
  price,
  imageUrl,
  details: shape ? { shape } : {}
}));

const mealPlans = [
  ['Weight Loss Meal Plan', 'Calorie-controlled meals with balanced macros for sustainable fat loss.', '$29', 'https://images.herzindagi.info/image/2024/Jan/Paleo-Diet-for-weight-loss.jpg'],
  ['Muscle Gain Meal Plan', 'High-protein surplus meals to fuel muscle growth and recovery.', '$35', 'https://fitnessvolt.com/wp-content/uploads/2017/03/perfect-meals.jpg'],
  ['Competition Diet', 'Peak week protocols, carb loading, and stage-ready nutrition.', '$79', 'https://i.pinimg.com/originals/cb/ab/c7/cbabc743201057af1ab8b86ba57889bc.jpg'],
  ['Healthy Lifestyle Plan', 'Balanced nutrition for everyday wellness and weight maintenance.', '$25', 'https://static.vecteezy.com/system/resources/previews/038/810/976/non_2x/ai-generated-a-well-portioned-plate-featuring-grilled-chicken-quinoa-and-steamed-vegetables-free-photo.jpeg'],
  ['Free Nutrition E-Book', 'Download our free “10 Rules of Effective Fat Loss” guide. Start making smarter food choices today.', null, null],
  ['Customized Meal Plan', 'Fully personalized around your dietary preferences, allergies, schedule, and specific fitness goals. Includes weekly adjustments.', '$59/mo', 'https://tse1.mm.bing.net/th/id/OIP.gMIrXxZflDTSCeYIAkwpzQHaE8?r=0&rs=1&pid=ImgDetMain&o=7&rm=3']
].map(([title, description, price, imageUrl]) => ({
  page: 'mealplans',
  kind: 'meal_plan',
  title,
  description,
  imageUrl,
  price
}));

module.exports = { products, mealPlans };
