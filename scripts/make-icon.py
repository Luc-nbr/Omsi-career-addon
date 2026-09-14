"""Genereert build/icon.ico: een busfront met bestemmingsfilm.

De vorm is bewust grof gehouden. Een icoon wordt in de taakbalk op 16 pixels
getoond, en daar overleven alleen grote vlakken met veel contrast.
"""
from PIL import Image, ImageDraw

SIZE = 256
DARK = (16, 20, 27, 255)
AMBER = (240, 180, 41, 255)
SIZES = [256, 128, 64, 48, 32, 16]


def draw_icon() -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Amber achtergrond, zodat het icoon ook op een donkere taakbalk opvalt.
    draw.rounded_rectangle((6, 6, SIZE - 6, SIZE - 6), radius=52, fill=AMBER)

    # Buscarrosserie van voren.
    draw.rounded_rectangle((50, 44, 206, 214), radius=28, fill=DARK)

    # Bestemmingsfilm bovenin.
    draw.rounded_rectangle((70, 64, 186, 94), radius=7, fill=AMBER)

    # Voorruit.
    draw.rounded_rectangle((66, 108, 190, 160), radius=13, fill=AMBER)

    # Koplampen.
    draw.ellipse((70, 174, 98, 202), fill=AMBER)
    draw.ellipse((158, 174, 186, 202), fill=AMBER)

    return image


def main() -> None:
    icon = draw_icon()
    icon.save("build/icon.ico", format="ICO", sizes=[(s, s) for s in SIZES])
    icon.save("build/icon.png", format="PNG")
    print("build/icon.ico en build/icon.png geschreven")


if __name__ == "__main__":
    main()
