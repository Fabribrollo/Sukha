declare namespace App {
  interface Locals {
    // Quién está usando el panel; lo completa el middleware en las páginas de /admin.
    admin: { nombre: string; email: string };
  }
}
