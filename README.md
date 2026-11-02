# Meru

Offline mountain peak finder. Point your phone at the mountains, see every peak named — no signal needed. Launching in Pokhara / Annapurna.

## Start building with Claude Code (terminal)

### 1. Install once
- Node 20+ and Python 3.11+
- Android Studio (emulator + USB debugging on a real Android phone)
- Xcode on a Mac for iOS (can come later)
- Claude Code: `npm install -g @anthropic-ai/claude-code`
- Expo account (free) for EAS builds later

### 2. Open the project
```bash
cd meru
git init
claude
```
Claude Code reads `CLAUDE.md` automatically.

### 3. Build step by step
Inside Claude Code, run one step at a time:
```
Do step 0 from docs/BUILD_STEPS.md
```
When it finishes: check the step's **Done when** criteria yourself, commit, then `/clear` and do the next step.

```bash
git add -A && git commit -m "step 0: project setup"
```

### 4. Steps at a glance
| Step | What | Checkpoint |
|---|---|---|
| 0 | Project setup | `npm test` passes |
| 1 | Terrain data pipeline | Pokhara ~800 m, Sarangkot ~1,550 m |
| 2 | Peaks + viewpoints data | You review the peak list |
| 3 | Core geo math + tests | Tests pass |
| 4 | Horizon + visibility engine | **Sarangkot panorama matches a real photo** (most important) |
| 5 | App shell, offline data | Runs in airplane mode |
| 6 | GPS + viewpoints | Same peaks as step 4 |
| 7 | Panorama mode | Smooth, works on web |
| 8 | Live camera overlay | Labels near real peaks |
| 9 | Calibration | Labels within ~1° |
| 10 | Photo capture + share | Instagram-worthy |
| 11 | Polish + test builds | APK on 5+ phones |
| 12 | Field test (you) | Go / no-go decision |

### Tips
- Don't skip step 4's checkpoint. If the panorama is wrong, the app will be wrong.
- When something's off, give Claude Code specifics: a screenshot, the phone model, which peak is wrong and by how much.
- Ask before adding features outside `docs/SPEC.md`; the prototype's job is to prove the core, not to be complete.

## Docs
- `CLAUDE.md` — rules and context for Claude Code
- `docs/SPEC.md` — full prototype spec
- `docs/BUILD_STEPS.md` — step-by-step prompts and acceptance criteria
