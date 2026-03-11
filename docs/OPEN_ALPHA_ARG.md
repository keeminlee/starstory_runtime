# StarStory Open Alpha Experience

### Concept Summary and Interaction Flow

## 1\. Core Vision

The Open Alpha experience introduces users to **StarStory / Meepo** through an interactive cosmic metaphor.

Instead of arriving at a traditional product dashboard, users enter a **living night sky** where stories appear as stars.

Each star represents a campaign story.
Each new user has the opportunity to **create a new star by telling a story.**

The entire experience is built around one narrative idea:

> **Stories become stars.**

The ARG-style onboarding guides a user from curiosity → interaction → storytelling → star birth.

When a user completes the process, a **new star is born in the sky**, representing their campaign and their instance of Meepo.

---

# 2\. System Surfaces

The experience intentionally splits interaction across two environments.

| Surface | Role |
| -- | -- |
| **Web Sky (starstory.online)** | Exploration space and visual story metaphor |
| **Discord Bot (Meepo)** | Canonical progression pathway |

The web interface is **observational and atmospheric**.

Discord is where **actual progression happens**.

Users primarily move forward through **Discord interactions**, while the sky reflects their progress visually.

---

# 3\. Initial User Experience

### Entry Point

Users are given a link:

```
starstory.online
```

When they arrive, they see a **navigable night sky**.

### Sky Navigation

The sky is pseudo-3D:

* Infinite horizontal scroll
* Subtle vertical movement
* Parallax star layers for depth
* Small ambient stars everywhere

The sky behaves like a **panoramic celestial sphere**.

Users explore simply by **moving the mouse**.

---

# 4\. Existing Stars and Constellations

Some stars already exist.

These represent **campaigns from closed-alpha users**.

Hovering over these constellations reveals:

* cryptic symbols
* mysterious glyphs
* fragments of meaning

The symbols suggest **stories hidden within the sky**, but they do not fully explain them.

This creates curiosity and reinforces the idea that **the sky is alive with stories**.

---

# 5\. The First Major Event: Star Formation

After some exploration, a dramatic event occurs.

From the **bottom of the screen**, streams of starlight begin to rise.

The starlight arcs upward through the sky and **converges into a single point**, forming a new star.

Importantly:

The motion implies that the starlight **came from the user**.

This subtly suggests:

> The story came from you.

Naturally, the user moves toward this new star.

---

# 6\. Hover Interaction: "Begin Your Chronicle"

When the user hovers over the newborn star:

Cryptic symbols appear, just like other stars.

However, this time the symbols **collapse into English text**.

The text reads:

```
Begin your chronicle
```

This text is also a clickable interaction.

Clicking it begins the onboarding process.

---

# 7\. Discord Integration

Clicking **Begin Your Chronicle** performs two actions simultaneously:

1. Invites the **Meepo Discord bot**
2. Authenticates the user with the web app

This connects the user’s Discord server with the StarStory system.

At this moment the star **does not disappear**.

Instead, it becomes a **forming star**.

---

# 8\. The Proto-Star

The user’s star now appears as a **proto-star**.

Visually it resembles a star that is still forming:

* swirling dust
* faint glow
* orbiting rings
* unstable structure

This proto-star represents the **user’s campaign before it exists**.

As the user progresses through the experience, the star **gathers mass and becomes brighter**.

---

# 9\. ARG Structure

The ARG intentionally divides interaction:

**Discord = progress**

**Web Sky = reflection + hints**

Users move forward through Discord commands and interactions.

If they become stuck, they return to the sky and interact with the forming star to request hints.

---

# 10\. Hint System

When the user clicks their forming star:

It reacts slightly.

Repeated clicks cause stronger reactions.

After roughly **3–5 clicks**, the star releases a burst of starlight.

The animation mirrors the **reverse of the original star birth**:

* starlight erupts outward
* light expands toward the viewer
* the light impacts the screen

Immediately after impact:

The user receives a **Discord message containing a hint**.

Hints therefore originate from the star but are delivered through Discord.

---

# 11\. First ARG Step: `/awaken`

After installing the bot, the expected next step is:

```
/awaken
```

Experienced Discord users will likely attempt slash commands automatically.

If they do not, they can request a hint from the star.

---

# 12\. Awakening Interaction

When `/awaken` is used:

If the user is **not in voice**, the bot responds:

> "The stars wish to listen."

If the user **is in voice**, the bot:

* joins the voice channel
* sends the message:

> "The star is listening intently."

---

# 13\. Storytelling Phase

Once the bot joins voice, the user begins speaking.

During this phase:

* speech is transcribed
* cryptic symbols appear in the sky
* the proto-star grows

Visual changes include:

* orbiting symbol rings
* increasing brightness
* expanding star mass

The user’s spoken words literally become **material for the forming star**.

---

# 14\. Session Completion

When the voice session ends, the system checks whether a real session occurred.

For MVP purposes, the validation is simple:

```
Minimum transcript length: ~100 lines
```

This acts as a lightweight filter to ensure the user actually ran a session.

---

# 15\. Failure State

If the session is too short:

The star does not reach critical mass.

Visually:

* rings collapse
* brightness fades
* the star returns to proto-state

Discord message:

> "The stars wish for a worthy story."

---

# 16\. Success State

If the session meets the threshold:

The star reaches **critical mass**.

Visual climax:

* rings accelerate
* symbols converge
* brightness intensifies
* the star ignites

The screen flashes white.

When the light fades:

A **new permanent star exists in the sky**.

---

# 17\. The Meaning of the Star

The newly born star represents two things:

1. The user’s **campaign story**
2. A new instance of **Meepo**

Each star is therefore a **living representation of Meepo** tied to that campaign.

Meepo becomes both:

* a guide within Discord
* a symbolic avatar of the star.

---

# 18\. Long-Term Vision

Over time the sky becomes populated with stars representing real campaigns.

Users exploring the sky see a **living universe of stories**.

Every new storyteller has the opportunity to add another star.

---

# Closing Summary

The Open Alpha experience transforms onboarding into a mythological narrative.

Instead of simply installing a bot, users experience the **birth of their story as a star**.

The sky becomes a persistent visualization of the entire storytelling ecosystem.

Every star represents a story told.

And every new story has the potential to **ignite a new star.**



# Updated Core Concept (Danny-Aligned)

## 1\. Constellation Interaction (Pre-Star vs Post-Star)

Danny’s question about interactivity reveals something important:

The sky should have **two different interaction states**.

### State 1 — Pre-Star (Initiation Phase)

Before the user creates their star:

Constellations are **mysterious and partially inaccessible**.

Hovering reveals:

* cryptic glyphs
* fragments of meaning
* symbolic motion

But the user **cannot fully interpret them yet**.

This reinforces the feeling that the user **has not yet learned the language of the sky**.

---

### State 2 — Post-Star (Initiated Phase)

Once the user’s star is born:

The user has become **a participant in the cosmos**.

The sky becomes readable.

Now when hovering constellations:

* glyphs resolve into **English text**
* star names appear
* campaigns can be explored
* constellations link to chronicles

This is a **narrative transformation mechanic**, not just UI.

The user goes from **observer → storyteller**.

Danny implicitly identified this as a **reward structure**, and it should absolutely stay.

---

# Updated Hint System (Danny Suggestion)

Danny’s particle turbulence idea is excellent and should become the **canonical interaction pattern**.

### Hint Build-Up Mechanic

When the user clicks their proto-star repeatedly:

Instead of instant hint delivery, the star shows **increasing instability**.

Visual stages:

```
Click 1 → subtle particle jitter
Click 2 → stronger turbulence
Click 3 → swirling starlight
Click 4 → unstable orbit rings
Click 5 → starlight burst
```

Then:

```
burst → light expands → Discord hint delivered
```

This does two important UX things:

1. **Shows progress toward something**
2. **Builds anticipation**

Without this, users might spam-click thinking nothing is happening.

Danny solved that problem.

---

# Updated Sky Navigation Model

Danny’s concern about moving targets is **extremely important**.

If stars move under the cursor, the experience becomes frustrating.

So the correct model is:

## Cylindrical Sky Navigation

The sky behaves like a **cylindrical panorama**.

### Horizontal

Infinite scroll.

### Vertical

Limited drift.

### Mouse influence

Subtle parallax only.

---

### Interaction Rule

Objects **freeze when hovered**.

This ensures:

```
hover → object stabilizes → interaction becomes precise
```

This is crucial.

Otherwise users will miss targets.

---

### Dead-Zone Navigation

Your suggestion (center neutral zone) is perfect.

The screen is divided into three horizontal zones:

```
Left Edge → scroll left
Center → no motion
Right Edge → scroll right
```

Mouse position only influences motion **near edges**.

This keeps the center stable for clicking.