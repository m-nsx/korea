import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
IMAGES_DIR = BASE_DIR / "images"
DATA_FILE = BASE_DIR / "data.json"
IMAGE_EXTENSIONS = {
    ".avif",
    ".bmp",
    ".gif",
    ".jpeg",
    ".jpg",
    ".png",
    ".tif",
    ".tiff",
    ".webp",
}


def synchronize(data_file=DATA_FILE, images_dir=IMAGES_DIR):
    data_file = Path(data_file)
    images_dir = Path(images_dir)

    if not images_dir.is_dir():
        raise FileNotFoundError("Dossier d'images introuvable : {}".format(images_dir))

    with data_file.open("r", encoding="utf-8") as file:
        entries = json.load(file)

    if not isinstance(entries, dict):
        raise ValueError("data.json doit contenir un objet JSON.")

    image_names = {
        path.name
        for path in images_dir.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    }

    entries = {
        name: description
        for name, description in entries.items()
        if name in image_names
    }

    for image_name in sorted(image_names):
        entries.setdefault(image_name, "WIP")

    with data_file.open("w", encoding="utf-8", newline="\n") as file:
        json.dump(entries, file, ensure_ascii=False, indent=2)
        file.write("\n")

    return len(image_names), len(entries)


if __name__ == "__main__":
    image_count, entry_count = synchronize()
    print(
        "Synchronisation terminée : {} images, {} entrées dans data.json.".format(
            image_count, entry_count
        )
    )
