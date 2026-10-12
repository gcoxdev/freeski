import type {
  AccessibilitySettings,
  AccessibilitySettingsStore,
} from "../accessibility/settings";

interface AccessibilityControlCallbacks {
  readonly onChange: (settings: AccessibilitySettings) => void;
  readonly onRestart: () => void;
  readonly onPanelVisibility: (visible: boolean) => void;
}

export class AccessibilityControls {
  private readonly openButton =
    document.querySelector<HTMLButtonElement>("#settings-toggle");
  private readonly panel =
    document.querySelector<HTMLElement>("#settings-panel");
  private readonly closeButton =
    document.querySelector<HTMLButtonElement>("#settings-close");
  private readonly restartButton =
    document.querySelector<HTMLButtonElement>("#settings-restart");
  private readonly reducedMotion = document.querySelector<HTMLInputElement>(
    "#setting-reduced-motion",
  );
  private readonly screenShake = document.querySelector<HTMLInputElement>(
    "#setting-screen-shake",
  );
  private readonly flash =
    document.querySelector<HTMLInputElement>("#setting-flash");
  private readonly volume =
    document.querySelector<HTMLInputElement>("#setting-volume");
  private readonly volumeOutput = document.querySelector<HTMLOutputElement>(
    "#setting-volume-output",
  );
  private readonly yetiPresentation = document.querySelector<HTMLInputElement>(
    "#setting-yeti-presentation",
  );

  constructor(
    private readonly store: AccessibilitySettingsStore,
    private readonly callbacks: AccessibilityControlCallbacks,
  ) {
    this.openButton?.addEventListener("click", this.open);
    this.closeButton?.addEventListener("click", this.close);
    this.panel?.addEventListener("keydown", this.onPanelKeyDown);
    this.restartButton?.addEventListener("click", this.restart);
    for (const input of this.inputs())
      input?.addEventListener("change", this.change);
    this.volume?.addEventListener("input", this.change);
    this.sync(store.getSnapshot());
  }

  get settings(): AccessibilitySettings {
    return this.store.getSnapshot();
  }

  get isOpen(): boolean {
    return this.panel?.hidden === false;
  }

  destroy(): void {
    this.openButton?.removeEventListener("click", this.open);
    this.closeButton?.removeEventListener("click", this.close);
    this.panel?.removeEventListener("keydown", this.onPanelKeyDown);
    this.restartButton?.removeEventListener("click", this.restart);
    for (const input of this.inputs())
      input?.removeEventListener("change", this.change);
    this.volume?.removeEventListener("input", this.change);
  }

  private inputs(): Array<HTMLInputElement | null> {
    return [
      this.reducedMotion,
      this.screenShake,
      this.flash,
      this.volume,
      this.yetiPresentation,
    ];
  }

  private readonly open = (): void => {
    if (!this.panel) return;
    this.panel.hidden = false;
    this.panel.setAttribute("aria-hidden", "false");
    this.openButton?.setAttribute("aria-expanded", "true");
    this.callbacks.onPanelVisibility(true);
    this.closeButton?.focus();
  };

  private readonly close = (): void => {
    if (!this.panel) return;
    this.panel.hidden = true;
    this.panel.setAttribute("aria-hidden", "true");
    this.openButton?.setAttribute("aria-expanded", "false");
    this.callbacks.onPanelVisibility(false);
    this.openButton?.focus();
  };

  private readonly onPanelKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== "Tab" || !this.panel) return;
    const focusable = [
      ...this.panel.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled])",
      ),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  private readonly change = (): void => {
    const next = this.store.update({
      flash: this.flash?.checked,
      reducedMotion: this.reducedMotion?.checked,
      screenShake: this.screenShake?.checked,
      volume: this.volume ? Number(this.volume.value) : undefined,
      yetiPresentation: this.yetiPresentation?.checked ? "reduced" : "full",
    });
    this.sync(next);
    this.callbacks.onChange(next);
  };

  private readonly restart = (): void => {
    this.close();
    this.callbacks.onRestart();
    document.querySelector<HTMLElement>("#game-canvas")?.focus();
  };

  private sync(settings: AccessibilitySettings): void {
    if (this.reducedMotion) this.reducedMotion.checked = settings.reducedMotion;
    if (this.screenShake) this.screenShake.checked = settings.screenShake;
    if (this.flash) this.flash.checked = settings.flash;
    if (this.volume) this.volume.value = settings.volume.toFixed(2);
    if (this.volumeOutput)
      this.volumeOutput.value = `${Math.round(settings.volume * 100)}%`;
    if (this.yetiPresentation)
      this.yetiPresentation.checked = settings.yetiPresentation === "reduced";
  }
}
