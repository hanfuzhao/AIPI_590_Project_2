import argparse
import json
import os

import matplotlib.pyplot as plt
import matplotlib.image as mpimg


def run(case_id: str, dataset_path: str, dataset_dir: str):
    with open(dataset_path) as f:
        data = json.load(f)
    case = next(c for c in data["cases"] if c["id"] == case_id)
    img_path = os.path.join(dataset_dir, case["image"])
    scale = case["price_scale"]

    img = mpimg.imread(img_path)
    fig, ax = plt.subplots(figsize=(14, 8))
    ax.imshow(img)
    ax.set_title(f"{case_id} — left=support, right=resistance, s=save, u=undo, q=quit")

    levels: list[dict] = list(case.get("ground_truth_levels", []))

    def redraw():
        for line in list(ax.lines):
            line.remove()
        for lvl in levels:
            y_px = scale["chart_top"] + (scale["price_top"] - lvl["price"]) / (scale["price_top"] - scale["price_bot"]) * (scale["chart_bottom"] - scale["chart_top"])
            color = "#22c55e" if lvl["role"] == "support" else "#ef4444"
            ax.axhline(y_px, color=color, linestyle="--", linewidth=1)
        fig.canvas.draw_idle()

    redraw()

    def on_click(event):
        if event.inaxes != ax or event.ydata is None:
            return
        y = event.ydata
        frac = (y - scale["chart_top"]) / max(1, scale["chart_bottom"] - scale["chart_top"])
        price = scale["price_top"] - frac * (scale["price_top"] - scale["price_bot"])
        role = "support" if event.button == 1 else "resistance"
        levels.append({"price": float(price), "role": role, "strength": 2.0})
        print(f"+ {role} @ {price:.4f}")
        redraw()

    def on_key(event):
        if event.key == "s":
            case["ground_truth_levels"] = levels
            with open(dataset_path, "w") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"Saved {len(levels)} levels.")
            plt.close(fig)
        elif event.key == "q":
            print("Quit without saving.")
            plt.close(fig)
        elif event.key == "u":
            if levels:
                removed = levels.pop()
                print(f"- removed {removed}")
                redraw()

    fig.canvas.mpl_connect("button_press_event", on_click)
    fig.canvas.mpl_connect("key_press_event", on_key)
    plt.show()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--case_id", required=True)
    ap.add_argument("--dataset", default="data/ground_truth.json")
    ap.add_argument("--dataset_dir", default="data")
    args = ap.parse_args()
    run(args.case_id, args.dataset, args.dataset_dir)


if __name__ == "__main__":
    main()
