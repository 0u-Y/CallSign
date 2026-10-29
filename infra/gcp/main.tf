terraform {
  required_version = ">= 1.9, < 2.0"
  required_providers {
    google = { source = "hashicorp/google", version = "6.49.0" }
  }
}
variable "project_id" { type = string }
variable "zone" { type = string }
variable "machine_type" { type = string }
variable "boot_image" { type = string } # Pin an exact approved image self-link.
variable "operator_cidr" { type = string }
variable "network" { type = string }
variable "runtime_service_account" { type = string }
provider "google" { project = var.project_id }
resource "google_compute_disk" "data" {
  name = "callsign-data"
  type = "pd-balanced"
  zone = var.zone
  size = 200
  lifecycle { prevent_destroy = true }
}
resource "google_compute_instance" "callsign" {
  name = "callsign-finals"
  zone = var.zone
  machine_type = var.machine_type
  deletion_protection = true
  tags = ["callsign-web"]
  boot_disk {
    initialize_params {
      image = var.boot_image
    }
  }
  attached_disk { source = google_compute_disk.data.id }
  network_interface {
    network = var.network
    access_config {}
  }
  metadata = { enable-oslogin = "TRUE", block-project-ssh-keys = "TRUE" }
  shielded_instance_config { enable_secure_boot = true }
  service_account {
    email = var.runtime_service_account
    scopes = ["https://www.googleapis.com/auth/logging.write"]
  }
  # No startup script: no chain/contract/key initialization on VM restart.
}
resource "google_compute_firewall" "web" {
  name = "callsign-web"
  network = var.network
  target_tags = ["callsign-web"]
  source_ranges = ["0.0.0.0/0"]
  allow {
    protocol = "tcp"
    ports = ["80", "443"]
  }
}
resource "google_compute_firewall" "operator" {
  name = "callsign-operator"
  network = var.network
  target_tags = ["callsign-web"]
  source_ranges = [var.operator_cidr]
  allow {
    protocol = "tcp"
    ports = ["22"]
  }
}
# TURN is opt-in; enable only after reviewing relay credentials, TLS and IP configuration.

variable "enable_turn" {
  type = bool
  default = false
}
resource "google_compute_firewall" "turn" {
  count = var.enable_turn ? 1 : 0
  name = "callsign-turn"
  network = var.network
  target_tags = ["callsign-web"]
  source_ranges = ["0.0.0.0/0"]
  allow {
    protocol = "udp"
    ports = ["3478", "49160-49200"]
  }
  allow {
    protocol = "tcp"
    ports = ["3478", "5349"]
  }
}

variable "enable_pbx_media" {
  type = bool
  default = false
}
resource "google_compute_firewall" "pbx_media" {
  count = var.enable_pbx_media ? 1 : 0
  name = "callsign-pbx-media"
  network = var.network
  target_tags = ["callsign-web"]
  source_ranges = ["0.0.0.0/0"]
  allow {
    protocol = "udp"
    ports = ["10000-10099"]
  }
}
