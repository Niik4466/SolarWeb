from PIL import Image
from pathlib import Path
import os

def compress_and_save_image(source_path, output_path):
    """
    Comprime una imagen reduciendo sus dimensiones a la mitad y la guarda 
    en la ruta de destino especificada.
    Crea el directorio de destino si no existe.
    """
    try:
        # 1. Asegurarse de que el directorio de destino exista
        #    os.path.dirname(output_path) obtiene el directorio padre del archivo
        output_folder = os.path.dirname(output_path)
        if not os.path.exists(output_folder):
            os.makedirs(output_folder)

        # 2. Cargar la imagen original
        with Image.open(source_path) as original_image:
            # 3. Comprimir la imagen reduciendo sus dimensiones
            width, height = original_image.size
            # Usamos // para división entera
            compressed_image = original_image.resize((width // 2, height // 2), Image.Resampling.LANCZOS)

            # 4. Guardar la imagen comprimida con calidad del 85%
            compressed_image.save(output_path, "JPEG", quality=85)
            print(f"Imagen comprimida: {source_path} -> {output_path}")

    except Exception as e:
        print(f"Error al comprimir {source_path}: {e}")

def main():
    """
    Función principal que recorre el directorio de origen, busca imágenes .jpg
    y las procesa para guardarlas en el directorio de destino.
    """
    source_directory = Path(os.getenv("IMAGES_TO_COMPRESS_SOURCE_DIR", "~/Imagenes/DatosCamera"))
    output_directory = Path(os.getenv("IMAGES_TO_COMPRESS_OUTPUT_DIR", "~/Imagenes/DatosCamera_Compressed"))

    # Verificar si el directorio de origen existe
    if not source_directory.is_dir():
        print(f"Error: El directorio de origen '{source_directory}' no existe.")
        return

    print(f"Iniciando compresión de imágenes desde '{source_directory}' hacia '{output_directory}'...")

    # 1. Buscar recursivamente todos los archivos .jpg en el directorio de origen
    #    .rglob('*.jpg') significa "recursive globbing" (búsqueda recursiva)
    image_files = list(source_directory.rglob('*.jpg'))

    if not image_files:
        print("No se encontraron archivos .jpg para comprimir.")
        return

    # 2. Iterar sobre cada imagen encontrada
    for source_image_path in image_files:
        # 3. Calcular la ruta relativa para mantener la estructura de carpetas
        #    Ej: Si source_image_path es 'DatosCamera/2025_01_01/img.jpg',
        #    relative_path será '2025_01_01/img.jpg'
        relative_path = source_image_path.relative_to(source_directory)

        # 4. Construir la ruta de destino completa
        #    Ej: 'DatosCamera_compressed' / '2025_01_01/img.jpg'
        output_image_path = output_directory / relative_path

        # 5. Llamar a la función para comprimir y guardar la imagen
        compress_and_save_image(source_image_path, output_image_path)

    print("\nProceso completado.")


if __name__ == "__main__":
    main()
