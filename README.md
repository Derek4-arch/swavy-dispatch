# Swavy Dispatch

Motorcycle (okada) parcel delivery for Lagos and Abuja.
Customers book a bike in 3 steps and see the price straight away. Riders accept jobs on their phone.
Everyone tracks the delivery live, and only the receiver's 4-digit code can complete it.
It also comes with a **Telegram bot** for booking by chat.

Everything runs on your own computer. You don't need to install any extra packages, only Node.js.

## Start it (Windows)

1. Install **Node.js 24 LTS** from https://nodejs.org (only needed once).
2. Double-click **`start.bat`**.
3. Your browser opens **http://localhost:3002**. Keep the black window open while you use the app.

On Mac or Linux, open a terminal in this folder and run `npm start`.

## Demo logins (SAMPLE accounts)

| Who | Email | Password |
|---|---|---|
| Customer (Lagos) | customer@swavy.ng | swavy123 |
| Rider (Lagos, Yaba) | rider@swavy.ng | swavy123 |
| Rider 2 (Lagos, Lekki) | rider2@swavy.ng | swavy123 |
| Dispatcher / admin | open **#/admin** | swavyadmin |

There are also extra sample accounts: rider3@swavy.ng (not verified yet, for testing the verify button), rider.abuja@swavy.ng and customer.abuja@swavy.ng, all with the password swavy123.
Everything marked **sample** (people, orders and prices) is made up for testing.

## What you can do

**Customer**
- **Send a package in 3 steps:** pickup area and address, drop-off area and address, then size, what it is, and the receiver's name and phone.
- **Instant price:** the price comes from a zone table (area to area), the package size, and an optional **Express** fee. You see it before you confirm.
- **Pay:** cash at pickup, cash on delivery, or transfer. *Transfer is simulated: no real money moves. Real payments would need Paystack or a similar provider later.*
- **Collect money for me:** if you're selling something, the rider collects the item price from the receiver. It's tracked until Swavy pays it to you.
- **Live tracking page** with a timeline, the rider's photo, name, plate and bike, a call button, and a little map showing the bike moving.
- **Share on WhatsApp:** this opens WhatsApp with the tracking link and the delivery code already typed. You press send.
- **Rate the rider** after delivery.

**Rider (motorcycle)**
- A big **Go online / offline** button.
- **Jobs near you**, nearest first, showing what you'll earn. Accept with one tap.
- Status steps: **Heading to pickup → Picked up (take a photo) → On the way → enter the receiver's code → Delivered**.
- **Earnings** for today and this week, plus the **cash in your hand** you still need to hand over.

**Dispatcher / admin** (`#/admin`)
- See all orders live, and **assign or reassign** riders.
- **Verify riders** (unverified riders can't go online).
- **Edit prices:** the zone-to-zone table, the medium and large multipliers, the express fee, and the rider's share.
- **Cash:** mark a rider's cash as received, and mark "collect money" amounts as paid to the sender.

## Telegram bot

### Try it without Telegram (test mode)
Open **http://localhost:3002/bot-test**. It looks like a Telegram chat and runs the exact same bot.
Orders you book there are real orders in the app, so you can then accept them as a rider and watch the chat get the updates.

### Put the real bot on Telegram (about 3 minutes)
1. Open Telegram on your phone and search for **@BotFather** (it has a blue tick).
2. Send it **/newbot**.
3. It asks for a name. Type something like **Swavy Dispatch**.
4. It asks for a username that ends in "bot". Type something like **SwavyDispatchBot**. If it's taken, try another.
5. BotFather replies with a long **token** that looks like `123456789:AAH...`. Copy it. Keep it secret, because anyone with it can control your bot.
6. In this folder, copy **`.env.example`** and rename the copy to **`.env`**. Open it with Notepad.
7. Paste the token after `TELEGRAM_BOT_TOKEN=`, so the line looks like `TELEGRAM_BOT_TOKEN=123456789:AAH...`. Save the file.
8. Close the black window and double-click **start.bat** again. The window should say `Telegram bot: @YourBot is live`.
9. In Telegram, open your bot and send **/start**.

Bot commands: **/start** (menu), **/book**, **/track SWD-12345**, **/price**, **/cancel**. Most things are buttons, so there's very little typing.
The bot only runs while the app is running on your computer, and your computer must be online.
Tracking links in bot messages are only clickable from other phones once the app is on a public web address (set `PUBLIC_URL` in `.env`).

## Use it on your phone (same Wi-Fi)
In `.env`, set `HOST=0.0.0.0`, then restart. On your phone, open `http://<your-computer's-IP>:3002`.
You can install it as an app with "Add to Home screen".

## Other commands
- `npm test` runs the automatic checks: the API flow and the bot conversation.
- `npm run db` gives a quick look inside the database (`npm run db -- orders` shows one table).
- To start fresh, close the app and delete the **`data`** folder. The sample data comes back on the next start.

## Good to know (limits)
- Payments are **simulated**. Cash is tracked, but no money moves through the app.
- Areas, zones and prices are **samples**. Change prices on the admin page.
- The map is a simple drawing, not Google Maps, and the bike's movement on it is **simulated**. Real GPS would need the rider's phone location and a maps provider.
- No SMS is sent. Receivers get their code through the WhatsApp share or the tracking link.
- Delivery is within one city at a time (Lagos or Abuja).
