<?php
return new class extends Migration {
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->text('notes')->nullable();
        });
    }
};
