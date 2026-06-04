"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const footerLinks = {
  Product: ["Chat", "Discover", "Enterprise", "Live Airspace"],
  Resources: ["Documentation", "API Reference", "Status", "Changelog"],
  Company: ["About", "Blog", "Careers", "Contact"],
  Legal: ["Privacy", "Terms", "Security"],
};

export function Footer() {
  return (
    <footer className="relative border-t border-border/40 bg-[oklch(0.055_0.01_260)]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-2">
            <a href="#" className="flex items-center gap-3 mb-4">
              <Image
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-X7ohEq5zMv1hCY6v7Br2Mp0TAU6yhF.png"
                alt="SkyQuery Logo"
                width={147}
                height={40}
              />
            </a>
            <p className="text-sm text-muted-foreground max-w-xs mb-6 leading-relaxed">
              Aviation intelligence powered by your enterprise data. Connect, analyze, and understand your operations.
            </p>
            <p className="text-xs text-muted-foreground">
              Powered by natural language SQL generation across connected enterprise data.
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-semibold mb-4 text-sm text-foreground">{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-muted-foreground hover:text-primary transition-colors duration-200"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-16 pt-8 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} SkyQuery AI. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs text-muted-foreground hover:text-primary transition-colors duration-200">
              Privacy Policy
            </a>
            <a href="#" className="text-xs text-muted-foreground hover:text-primary transition-colors duration-200">
              Terms of Service
            </a>
          </div>
        </div>
      </div>

      {/* Decorative animated wave at top */}
      <div className="absolute -top-px left-0 right-0 h-px overflow-hidden">
        <motion.div
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="h-full w-1/2"
          style={{ background: "linear-gradient(to right, transparent, oklch(0.72 0.14 200 / 0.6), transparent)" }}
        />
      </div>
    </footer>
  );
}
