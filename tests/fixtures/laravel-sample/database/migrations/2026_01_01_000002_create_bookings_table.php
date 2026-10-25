<?php
return new class extends Migration {
    public function up(): void
    {
        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable();
            $table->dateTime('starts_at');
            $table->enum('status', ['pending', 'paid']);
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }
};
